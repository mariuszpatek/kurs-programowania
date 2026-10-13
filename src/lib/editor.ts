import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { tags as t } from '@lezer/highlight';

// Colours come from the page's CSS variables, so the editor follows the light/dark theme on its own.
const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', fontSize: '14.5px' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.75' },
  '.cm-content': { padding: '14px 0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 16px 0 6px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-3)', border: 'none', paddingLeft: '8px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-2)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 70%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-bg) !important' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--accent-bg)', outline: '1px solid var(--line-strong)' },
  '.cm-foldGutter span': { color: 'var(--text-3)' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent-bg)', color: 'var(--text)' },
});

const syntax = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-function)' },
  { tag: t.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
]);

export function createEditor(parent: HTMLElement, doc: string, onChange?: (doc: string) => void): EditorView {
  return new EditorView({
    parent,
    doc,
    extensions: [
      basicSetup,
      python(),
      theme,
      syntaxHighlighting(syntax),
      indentUnit.of('    '),
      keymap.of([indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && onChange) onChange(u.state.doc.toString());
      }),
    ],
  });
}

export function setDoc(editor: EditorView, doc: string) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: doc } });
}
