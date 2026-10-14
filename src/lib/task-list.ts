// The list of a lesson's tasks, shared by the course page and the lesson page.
// When a lesson has in-class tasks, they are listed first under their own heading.
import { taskPath, type Course, type Task } from './content';
import type { TaskStatus } from './progress';

const STATUS_TEXT: Record<TaskStatus, string> = { done: 'zaliczone', started: 'w trakcie', todo: 'do zrobienia' };

const el = (tag: string, text = '', className = '') => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};

function rows(course: Course, tasks: Task[], statuses: Map<string, TaskStatus>) {
  const list = el('ol', '', 'row-list');
  for (const t of tasks) {
    const status = statuses.get(t.id) ?? 'todo';
    const row = el('a', '', 'row') as HTMLAnchorElement;
    row.href = taskPath(course, t);
    const title = el('span', t.title, 'row-title');
    if (t.draft) title.append(el('span', 'szkic', 'draft-badge'));
    row.append(el('span', String(t.number), 'row-number'), title, el('span', STATUS_TEXT[status], `status-dot ${status}`));
    const li = el('li');
    li.append(row);
    list.append(li);
  }
  return list;
}

export function renderTaskList(container: HTMLElement, course: Course, tasks: Task[], statuses: Map<string, TaskStatus>) {
  const inClass = tasks.filter((t) => t.in_class);
  const homework = tasks.filter((t) => !t.in_class);
  if (!inClass.length) {
    container.replaceChildren(rows(course, homework, statuses));
    return;
  }
  const groups = [
    { title: 'Na lekcji', tasks: inClass },
    { title: 'Zadania domowe', tasks: homework },
  ].filter((g) => g.tasks.length);
  container.replaceChildren(
    ...groups.map((g) => {
      const group = el('div', '', 'task-group');
      group.append(el('p', g.title, 'task-group-title'), rows(course, g.tasks, statuses));
      return group;
    }),
  );
}
