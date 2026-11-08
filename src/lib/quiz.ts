// Closed questions in lessons: a Markdown list where every item is a checkbox, [x] on the right answer.
// The first line of an item is the answer, the indented lines under it explain it:
//
//   - [ ] 3
//     Tyle wyjdzie, gdy pętla obróci się tylko raz, jak `if`.
//   - [x] 27
//     `x` ma po kolei 1, 3, 9…
//
// The page shows A) B) C) … buttons. A wrong pick turns red with its explanation and the reader tries again;
// the right one turns green and closes the question. sync-content checks every quiz (scripts/sync-content.mjs).
// Each pick also sends a "quiz-answer" event (QuizAnswer), which a "choice" task page saves as an attempt.

export type QuizOption = { correct: boolean; answer: string; explanation: string };
/** Detail of the bubbling "quiz-answer" event: which question (in page order) and what was picked. */
export type QuizAnswer = { question: number; letter: string; answer: string; correct: boolean };

const LETTERS = 'ABCDEFGHIJ';

/** The quiz as HTML; answer and explanation are already rendered Markdown. */
export function quizHtml(options: QuizOption[]): string {
  const buttons = options
    .map((o, i) => `<button type="button" class="quiz-option"${o.correct ? ' data-correct' : ''}><span class="quiz-letter">${LETTERS[i]}</span><span>${o.answer}</span></button>`)
    .join('');
  const explanations = options
    .map((o) => `<div class="quiz-explanation" hidden><p class="quiz-verdict">${o.correct ? 'Dobrze!' : 'Nie tym razem.'}</p>${o.explanation}</div>`)
    .join('');
  return `<div class="quiz"><div class="quiz-options">${buttons}</div><div class="quiz-feedback" aria-live="polite">${explanations}</div></div>\n`;
}

export function mountQuizzes(root: HTMLElement) {
  for (const [question, quiz] of root.querySelectorAll<HTMLElement>('.quiz').entries()) {
    if ('ready' in quiz.dataset) continue;
    quiz.dataset.ready = '';
    const buttons = [...quiz.querySelectorAll<HTMLButtonElement>('.quiz-option')];
    const explanations = [...quiz.querySelectorAll<HTMLElement>('.quiz-explanation')];
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => {
        const correct = button.hasAttribute('data-correct');
        explanations.forEach((e, j) => (e.hidden = j !== i));
        explanations[i].classList.add(correct ? 'right' : 'wrong');
        button.classList.add(correct ? 'right' : 'wrong');
        button.disabled = true;
        if (correct) for (const other of buttons) other.disabled = true;
        const detail: QuizAnswer = { question, letter: LETTERS[i], answer: button.lastElementChild!.textContent ?? '', correct };
        quiz.dispatchEvent(new CustomEvent('quiz-answer', { detail, bubbles: true }));
      });
    });
  }
}
