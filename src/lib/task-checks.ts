// "Sprawdź się": a task linked right after the part of the lesson it practises, so the student
// does not have to scroll to the task list at the bottom to check what they have just read:
//
//   lessons/02.md     <!-- zadanie: 3 -->       task number 3 of this lesson
//                     <!-- zadanie: 3, 4 -->    several tasks in one card
//
// The marker is an HTML comment, so the lesson reads the same without it. sync-content rejects
// a marker with a number that is not a task of the lesson.
import { taskPath, type Course, type Task } from './content';
import type { TaskStatus } from './progress';

const MARKER = /^\s*zadanie:\s*(\d+(?:\s*,\s*\d+)*)\s*$/;
const MARKER_LINE = /^[ \t]*<!--\s*zadanie:\s*(\d+(?:\s*,\s*\d+)*)\s*-->[ \t]*$/gm;

const STATUS_TEXT: Record<TaskStatus, string> = { done: 'zaliczone', started: 'w trakcie', todo: 'do zrobienia' };

const el = (tag: string, text = '', className = '') => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};

const numbers = (list: string) => list.split(',').map((n) => Number(n.trim()));

function checkCard(course: Course, tasks: Task[], statuses: Map<string, TaskStatus>): HTMLElement {
  const card = el('aside', '', 'task-check');
  const allDone = tasks.every((t) => statuses.get(t.id) === 'done');
  if (allDone) card.classList.add('done');
  card.append(el('span', '', 'task-check-icon'));
  const body = el('div', '', 'task-check-body');
  body.append(el('p', allDone ? 'Sprawdzone' : 'Sprawdź się', 'task-check-title'));
  for (const t of tasks) {
    const status = statuses.get(t.id) ?? 'todo';
    const link = el('a', '', 'task-check-link') as HTMLAnchorElement;
    link.href = taskPath(course, t);
    link.append(el('span', `Zadanie ${t.number}`, 'task-check-number'), el('span', t.title, 'task-check-name'));
    link.append(el('span', STATUS_TEXT[status], `status-dot ${status}`), el('span', '→', 'task-check-arrow'));
    body.append(link);
  }
  card.append(body);
  return card;
}

/** Replaces <!-- zadanie: N --> markers with "Sprawdź się" cards. Tasks the reader cannot see (drafts) are skipped. */
export function mountTaskChecks(root: HTMLElement, course: Course, tasks: Task[], statuses: Map<string, TaskStatus>) {
  const markers: Comment[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) if (MARKER.test((walker.currentNode as Comment).data)) markers.push(walker.currentNode as Comment);
  for (const marker of markers) {
    const linked = numbers(marker.data.match(MARKER)![1])
      .map((n) => tasks.find((t) => t.number === n))
      .filter((t): t is Task => Boolean(t));
    if (linked.length) marker.replaceWith(checkCard(course, linked, statuses));
    else marker.remove();
  }
}

/** Markers as plain text for the "copy lesson" export: "Sprawdź się: zadanie 3 (Tytuł)". */
export function taskChecksAsText(md: string, tasks: Task[]): string {
  return md.replace(MARKER_LINE, (_, list: string) => {
    const linked = numbers(list)
      .map((n) => tasks.find((t) => t.number === n))
      .filter((t): t is Task => Boolean(t));
    return linked.length ? `**Sprawdź się:** ${linked.map((t) => `zadanie ${t.number} (${t.title})`).join(', ')}` : '';
  });
}
