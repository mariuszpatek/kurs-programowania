// AI tutor next to every task except "Wytłumacz koledze" (src/components/Assistant.astro). It answers with the
// provider and model the teacher picked for ask() / chat() (lms_llm_settings), is switched on in the dashboard
// ("Model AI") and has a daily limit of questions from midnight. API keys live only in Supabase secrets.
// The task, course and hints come from the database (prompt.ts builds the prompt); the page sends only the
// conversation, the student's code and the latest result.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCall, parseResponse, providerError, withoutOptionalParams, type Effort, type Message, type Provider } from '../_shared/providers.ts';
import { MAX_CHARS, tutorSystem } from './prompt.ts';

const MAX_TOKENS = 1500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KEYS: Record<Provider, string> = { anthropic: 'ANTHROPIC_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const clip = (t: unknown) => String(t ?? '').slice(0, MAX_CHARS);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json({ error: 'Zaloguj się, żeby zapytać asystenta.' }, 401);

  const body = await req.json().catch(() => null);
  const messages: Message[] = (Array.isArray(body?.messages) ? body.messages.slice(-10) : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role, content: clip(m.content) }));
  if (messages.at(-1)?.role !== 'user') return json({ error: 'Pusta wiadomość.' }, 400);

  const { data: hasAccess } = await supabase.rpc('lms_has_access');
  if (!hasAccess) return json({ error: 'To konto nie ma dostępu do kursu. Napisz do nauczyciela.' }, 403);

  const { data: settings } = await admin.from('lms_llm_settings').select('*').eq('id', 1).single();
  if (!settings?.assistant_enabled) return json({ error: 'Asystent jest wyłączony.' }, 403);

  // read with the student's key: RLS hides drafts and locked lessons
  const { data: task } = await supabase
    .from('lms_tasks')
    .select('id, kind, title, body_md, predict_code, hints, course_id, lesson_number')
    .eq('id', String(body?.taskId ?? ''))
    .maybeSingle();
  if (!task) return json({ error: 'Nie ma takiego zadania. Odśwież stronę.' }, 404);
  if (task.kind === 'explain') return json({ error: 'W tym zadaniu rozmawiasz z Robciem, nie z asystentem.' }, 400);
  const [{ data: course }, { data: lessons }, { data: hintViews }] = await Promise.all([
    admin.from('lms_courses').select('title, level, assistant_notes').eq('id', task.course_id).maybeSingle(),
    admin.from('lms_lessons').select('number, title, topics').eq('course_id', task.course_id).lte('number', task.lesson_number).order('number'),
    supabase.from('lms_hint_views').select('hint_index').eq('user_id', auth.user.id).eq('task_id', task.id),
  ]);
  const system = tutorSystem(
    { ...task, predict_code: task.predict_code ?? '', hints: task.hints ?? [] },
    { title: course?.title ?? '', level: course?.level ?? '', assistant_notes: course?.assistant_notes ?? '' },
    lessons ?? [],
    { code: String(body?.code ?? ''), result: String(body?.result ?? ''), hintsOpened: new Set((hintViews ?? []).map((h) => h.hint_index)).size },
  );

  const dailyLimit = Number(settings.assistant_daily_limit);
  const { data: allowed, error } = await supabase.rpc('lms_use_assistant', { daily_limit: dailyLimit });
  if (error) return json({ error: 'Nie udało się sprawdzić limitu.' }, 500);
  if (!allowed) return json({ error: `Na dziś wykorzystano limit ${dailyLimit} pytań. Odnowi się o północy.` }, 429);

  const provider = settings.provider as Provider;
  const model = provider === 'anthropic' ? settings.anthropic_model : settings.openrouter_model;
  const apiKey = Deno.env.get(KEYS[provider]);
  if (!apiKey) {
    console.error('missing secret', KEYS[provider]);
    return json({ error: 'Asystent jest chwilowo niedostępny.' }, 502);
  }

  const request = { messages, system, max_tokens: MAX_TOKENS, effort: (settings.effort ?? undefined) as Effort | undefined };
  const send = (r: typeof request) => {
    const call = buildCall(provider, model, apiKey, r);
    return fetch(call.url, { method: 'POST', headers: call.headers, body: JSON.stringify(call.body) });
  };
  let response = await send(request);
  const retry = response.status === 400 ? withoutOptionalParams(request) : null;
  if (retry) {
    console.warn(provider, model, '400, retrying without', retry.dropped.join(', '), await response.text());
    response = await send(retry.request as typeof request);
  }
  if (!response.ok) {
    console.error(provider, response.status, await response.text());
    const e = providerError(response.status);
    return json({ error: e.message }, e.status);
  }
  const result = parseResponse(provider, await response.json());
  if (!result.text.trim()) return json({ error: 'Asystent nie odpowiedział. Spróbuj zapytać inaczej.' }, 502);
  return json({ reply: result.text });
});
