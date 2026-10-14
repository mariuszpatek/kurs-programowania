// Registry of programming languages. Adding a course in a new language starts here:
// write src/lib/languages/<id>/index.ts (editor mode, highlighter, optional runner) and add it below.
// A language without a runner still works: lessons render, tasks show without Run/Check.
import { escapeHtml } from './highlight';
import { python } from './python';
import type { Language } from './types';

const languages: Language[] = [python];

/** Fallback for a course language that has no entry yet. */
function plainLanguage(id: string): Language {
  return {
    id,
    label: id,
    aliases: [id],
    fileName: 'kod.txt',
    editorExtension: () => [],
    highlight: escapeHtml,
  };
}

export function languageById(id: string): Language {
  return languages.find((l) => l.id === id) ?? plainLanguage(id);
}

/** Language for a Markdown code fence name such as "py"; undefined for "output", "text" etc. */
export function languageByFence(fence: string): Language | undefined {
  return languages.find((l) => l.aliases.includes(fence.toLowerCase()));
}

export type { Language } from './types';
