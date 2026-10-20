// A line under the output when the program asked the real model: which model, how many calls,
// what it cost and how much of the monthly limit is used.
import type { ModelCall } from './languages/types';

const usd = (n: number) => `${n < 0.01 ? n.toFixed(4) : n.toFixed(2)} USD`.replace('.', ',');

const calls = (n: number) => (n === 1 ? '1 zapytanie' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? `${n} zapytania` : `${n} zapytań`);

export function modelUsageText(list: ModelCall[] | undefined): string {
  if (!list?.length) return '';
  const last = list.at(-1)!;
  const cost = list.reduce((sum, c) => sum + Number(c.cost_usd), 0);
  const cut = list.some((c) => c.stop_reason === 'max_tokens') ? ' · odpowiedź ucięta przez max_tokens' : '';
  return `Model ${last.model}: ${calls(list.length)}, ${usd(cost)} · w tym miesiącu ${usd(Number(last.spent_usd))} z ${usd(Number(last.limit_usd))}${cut}`;
}
