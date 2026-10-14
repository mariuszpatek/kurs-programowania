import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight';
import type { Parser } from '@lezer/common';

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Same token groups as the editor's HighlightStyle (src/lib/editor.ts); colours live in global.css. */
const highlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string)], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: 'tok-function' },
  { tag: t.comment, class: 'tok-comment' },
]);

/** Turns code into HTML spans using a Lezer parser. */
export function highlightWith(parser: Parser, code: string): string {
  let html = '';
  highlightCode(
    code,
    parser.parse(code),
    highlighter,
    (text, classes) => (html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text)),
    () => (html += '\n'),
  );
  return html;
}
