// "Choose the answer" task: the questions are quizzes in the task text (src/lib/quiz.ts).
// Every pick is saved as an attempt, so hints unlock after wrong ones and the teacher sees them;
// the attempt that leaves every question answered right is the passing one.
import { saveAttempt } from './progress';
import type { QuizAnswer } from './quiz';
import { taskState } from './state';

export function mountChoice(body: HTMLElement, task: { id: string }) {
  const total = body.querySelectorAll('.quiz').length;
  const solved = new Set<number>();
  const picks: string[] = [];
  body.addEventListener('quiz-answer', (e) => {
    const { question, letter, answer, correct } = (e as CustomEvent<QuizAnswer>).detail;
    if (correct) solved.add(question);
    const pick = `Pytanie ${question + 1}: ${letter}) ${answer} (${correct ? 'dobrze' : 'źle'})`;
    picks.push(pick);
    taskState.lastResult = `Odpowiedzi ucznia:\n${picks.join('\n')}\nDobrze rozwiązane pytania: ${solved.size} z ${total}`;
    void saveAttempt(task.id, pick, solved.size === total, { question: question + 1, letter, answer, correct, solved: solved.size, total });
  });
}
