// "Model AI" in the teacher dashboard: which provider answers ask() / chat() (Anthropic or OpenRouter),
// which models, prices for computing the cost, monthly limits, and this month's spending per person.
// The edge function `llm` reads the same tables (supabase/migrations/…_lms_llm.sql).
import { supabase } from './supabase';

type Settings = {
  provider: 'anthropic' | 'openrouter';
  anthropic_model: string;
  openrouter_model: string;
  effort: 'low' | 'medium' | 'high' | null;
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  student_monthly_limit_usd: number;
  teacher_monthly_limit_usd: number;
};
type Usage = { email: string; calls: number; cost_usd: number };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};

function field(label: string, input: HTMLInputElement | HTMLElement, hint = '') {
  const wrap = el('label', '', 'model-field');
  wrap.append(el('span', label, 'model-label'), input);
  if (hint) wrap.append(el('span', hint, 'muted model-hint'));
  return wrap;
}

function input(value: string | number, type = 'text', step = '') {
  const i = el('input');
  i.type = type;
  i.value = String(value);
  if (step) i.step = step;
  if (type === 'number') i.min = '0';
  return i;
}

const usd = (n: number) => `${Number(n).toFixed(Number(n) < 0.01 && n > 0 ? 4 : 2)} USD`;

/** Fills `root` (an empty section) or leaves it hidden when the migration has not been run yet. */
export async function mountModelSettings(root: HTMLElement) {
  const [{ data: settings, error }, { data: usage }, { data: limits }, { data: enrollments }] = await Promise.all([
    supabase.from('lms_llm_settings').select('*').eq('id', 1).maybeSingle<Settings>(),
    supabase.rpc('lms_teacher_llm_usage'),
    supabase.from('lms_llm_limits').select('email, monthly_limit_usd'),
    supabase.from('lms_enrollments').select('email'),
  ]);
  if (error || !settings) return;
  root.hidden = false;

  // ---------------------------------------------------------------- provider and defaults
  const form = el('form', '', 'model-form');
  const providers = el('div', '', 'model-providers');
  const radios = (['anthropic', 'openrouter'] as const).map((p) => {
    const label = el('label', '', 'model-provider');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'provider';
    radio.value = p;
    radio.checked = settings.provider === p;
    label.append(radio, el('strong', p === 'anthropic' ? 'Anthropic' : 'OpenRouter'), el('span', p === 'anthropic' ? 'bezpośrednio, klucz ANTHROPIC_API_KEY' : 'wielu dostawców, klucz OPENROUTER_API_KEY', 'muted'));
    providers.append(label);
    return radio;
  });
  const anthropicModel = input(settings.anthropic_model);
  const openrouterModel = input(settings.openrouter_model);
  const effort = el('select');
  for (const [value, label] of [['low', 'low (domyślnie)'], ['medium', 'medium'], ['high', 'high'], ['', 'nie wysyłaj (np. Haiku 4.5)']]) {
    const option = el('option', label);
    option.value = value;
    option.selected = (settings.effort ?? '') === value;
    effort.append(option);
  }
  const priceIn = input(settings.input_price_per_mtok, 'number', '0.01');
  const priceOut = input(settings.output_price_per_mtok, 'number', '0.01');
  const studentLimit = input(settings.student_monthly_limit_usd, 'number', '0.1');
  const teacherLimit = input(settings.teacher_monthly_limit_usd, 'number', '0.1');
  const save = el('button', 'Zapisz ustawienia', 'primary');
  const message = el('span', '', 'muted');

  form.append(
    field('Kto odpowiada na ask() i chat()', providers),
    el('div', '', 'model-grid'),
    el('div', '', 'model-grid'),
    el('div', '', 'model-actions'),
  );
  const [, models, money, actions] = [...form.children] as HTMLElement[];
  models.append(
    field('Model Anthropic', anthropicModel, 'np. claude-haiku-5-5'),
    field('Model OpenRouter', openrouterModel, 'np. anthropic/claude-haiku-5.5'),
    field('Myślenie (effort)', effort, 'ile model myśli przed odpowiedzią; myślenie płaci się jak tokeny wyjścia'),
  );
  money.append(
    field('Cena wejścia (USD / 1M tokenów)', priceIn, 'do liczenia kosztu przy Anthropic; OpenRouter podaje koszt sam'),
    field('Cena wyjścia (USD / 1M tokenów)', priceOut),
    field('Limit ucznia (USD / miesiąc)', studentLimit),
    field('Twój limit (USD / miesiąc)', teacherLimit),
  );
  actions.append(save, message);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    save.disabled = true;
    const { error } = await supabase
      .from('lms_llm_settings')
      .update({
        provider: radios.find((r) => r.checked)!.value,
        anthropic_model: anthropicModel.value.trim(),
        openrouter_model: openrouterModel.value.trim(),
        effort: effort.value || null,
        input_price_per_mtok: Number(priceIn.value),
        output_price_per_mtok: Number(priceOut.value),
        student_monthly_limit_usd: Number(studentLimit.value),
        teacher_monthly_limit_usd: Number(teacherLimit.value),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    save.disabled = false;
    message.textContent = error ? `Nie udało się: ${error.message}` : 'Zapisane. Następne zapytania pójdą już z nowymi ustawieniami.';
  });

  // ---------------------------------------------------------------- spending and limits per person
  const spent = new Map(((usage ?? []) as Usage[]).map((u) => [u.email, u]));
  const overrides = new Map(((limits ?? []) as { email: string; monthly_limit_usd: number }[]).map((l) => [l.email, l.monthly_limit_usd]));
  const emails = [...new Set([...(enrollments ?? []).map((e) => e.email as string), ...spent.keys()])].sort();

  const table = el('table', '', 'model-usage');
  const head = el('tr');
  for (const h of ['Osoba', 'Zapytania w tym miesiącu', 'Koszt', 'Limit (USD / miesiąc)']) head.append(el('th', h));
  table.append(head);
  for (const email of emails) {
    const row = el('tr');
    const u = spent.get(email);
    const limitInput = input(overrides.get(email) ?? '', 'number', '0.1');
    limitInput.placeholder = `domyślny (${settings.student_monthly_limit_usd})`;
    limitInput.setAttribute('aria-label', `Limit dla ${email}`);
    const state = el('span', '', 'muted');
    limitInput.addEventListener('change', async () => {
      const value = limitInput.value.trim();
      const { error } = value
        ? await supabase.from('lms_llm_limits').upsert({ email, monthly_limit_usd: Number(value) })
        : await supabase.from('lms_llm_limits').delete().eq('email', email);
      state.textContent = error ? `błąd: ${error.message}` : 'zapisane';
      setTimeout(() => (state.textContent = ''), 2500);
    });
    const limitCell = el('td');
    limitCell.append(limitInput, state);
    row.append(el('td', email), el('td', String(u?.calls ?? 0)), el('td', usd(u?.cost_usd ?? 0)), limitCell);
    table.append(row);
  }

  root.append(
    el('h2', 'Model AI'),
    el(
      'p',
      'Model, z którego korzystają ask() i chat() w zadaniach. Klucze API są w sekretach funkcji llm w Supabase, nie tutaj. Po przekroczeniu limitu model odmawia do końca miesiąca.',
      'muted',
    ),
    form,
    el('h3', 'Zużycie i limity'),
    emails.length ? table : el('p', 'Nikt jeszcze nie korzystał z modelu.', 'muted'),
  );
}
