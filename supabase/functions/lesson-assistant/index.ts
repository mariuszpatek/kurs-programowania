// Bajtek, the assistant at lesson notes (src/components/Bajtek.astro): answers questions about the lessons the
// student has unlocked. Same provider and model as Kodek (lms_llm_settings), its own switch and daily limit in the
// dashboard ("Model AI"). The lessons come from the database, read with the student's key, so RLS hides drafts and
// locked lessons; the page sends only the conversation, the course and the lesson being read.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCall, parseResponse, providerError, withoutOptionalParams, type Effort, type Message, type Provider } from '../_shared/providers.ts';
import { BAJTEK_NAME, MAX_CHARS, bajtekSystem, type NotesLesson } from './prompt.ts';

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
  if (!auth.user) return json({ error: 'Zaloguj się, żeby zadać pytanie.' }, 401);

  const body = await req.json().catch(() => null);
  const messages: Message[] = (Array.isArray(body?.messages) ? body.messages.slice(-10) : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role, content: clip(m.content) }));
  if (messages.at(-1)?.role !== 'user') return json({ error: 'Pusta wiadomość.' }, 400);

  const { data: hasAccess } = await supabase.rpc('lms_has_access');
  if (!hasAccess) return json({ error: 'To konto nie ma dostępu do kursu. Napisz do nauczyciela.' }, 403);

  const { data: settings } = await admin.from('lms_llm_settings').select('*').eq('id', 1).single();
  if (!settings?.bajtek_enabled) return json({ error: `${BAJTEK_NAME} jest wyłączony.` }, 403);

  // read with the student's key: RLS hides drafts and locked lessons
  const courseId = String(body?.courseId ?? '');
  const current = Number(body?.lessonNumber);
  const [{ data: lessons }, { data: tasks }, { data: isTeacher }] = await Promise.all([
    supabase.from('lms_lessons').select('number, title, topics, body_md').eq('course_id', courseId).order('number'),
    supabase.from('lms_tasks').select('lesson_number, number, title').eq('course_id', courseId).order('number'),
    supabase.rpc('lms_is_teacher'),
  ]);
  // the teacher sees every lesson; Bajtek answers them as a student reading this lesson would be answered
  const visible = (lessons ?? []).filter((l) => !isTeacher || l.number <= current);
  if (!visible.some((l) => l.number === current)) return json({ error: 'Nie ma takiej lekcji. Odśwież stronę.' }, 404);
  const { data: course } = await admin.from('lms_courses').select('title, level, assistant_notes').eq('id', courseId).maybeSingle();
  const notesLessons: NotesLesson[] = visible.map((l) => ({
    ...l,
    topics: l.topics ?? [],
    tasks: (tasks ?? []).filter((t) => t.lesson_number === l.number),
  }));
  const system = bajtekSystem(
    { title: course?.title ?? '', level: course?.level ?? '', assistant_notes: course?.assistant_notes ?? '' },
    notesLessons,
    current,
  );

  const dailyLimit = Number(settings.bajtek_daily_limit);
  const { data: allowed, error } = await supabase.rpc('lms_use_bajtek', { daily_limit: dailyLimit });
  if (error) return json({ error: 'Nie udało się sprawdzić limitu.' }, 500);
  if (!allowed) return json({ error: `Na dziś wykorzystano limit ${dailyLimit} pytań. Odnowi się o północy.` }, 429);

  const provider = settings.provider as Provider;
  const model = provider === 'anthropic' ? settings.anthropic_model : settings.openrouter_model;
  const apiKey = Deno.env.get(KEYS[provider]);
  if (!apiKey) {
    console.error('missing secret', KEYS[provider]);
    return json({ error: `${BAJTEK_NAME} jest chwilowo niedostępny.` }, 502);
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
  if (!result.text.trim()) return json({ error: `${BAJTEK_NAME} nie odpowiedział. Spróbuj zapytać inaczej.` }, 502);
  return json({ reply: result.text });
});
