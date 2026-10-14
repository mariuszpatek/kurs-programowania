import { python as pythonEditor } from '@codemirror/lang-python';
import { parser } from '@lezer/python';
import { highlightWith } from '../highlight';
import type { Language } from '../types';
import { pythonRunner } from './runner';

export const python: Language = {
  id: 'python',
  label: 'Python',
  aliases: ['python', 'py'],
  fileName: 'twoj_kod.py',
  editorExtension: pythonEditor,
  highlight: (code) => highlightWith(parser, code),
  runner: pythonRunner,
};
