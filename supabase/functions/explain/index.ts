// "Wytłumacz koledze" (beta): the student explains the concepts of a lesson to a younger friend played by Claude.
// The teacher's key (lms_task_notes) and the Anthropic key stay here; the attempt is saved here too,
// so the browser cannot mark the task as passed by itself.
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  OPENER,
  SUMMARY_SCHEMA,
  chatSystem,
  cleanMessages,
  levelText,
  passed,
  studentMessages,
  summarySystem,
  transcript,
  MAX_STUDENT_MESSAGES,
  type Summary,
} from './prompt.ts';

const MODEL = Deno.env.get('EXPLAIN_MODEL') ?? 'claude-haiku-5-5';
// One call per conversation, so the grade gets the model that follows the key's rules more closely.
const SUMMARY_MODEL = Deno.env.get('EXPLAIN_SUMMARY_MODEL') ?? 'claude-sonnet-5-5';
const DAILY_LIMIT = Number(Deno.env.get('EXPLAIN_DAILY_LIMIT') ?? '60');
const TASK_LIMIT = Number(Deno.env.get('EXPLAIN_TASK_LIMIT') ?? '80');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const text = (message: Anthropic.Message) =>
  message.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json({ error: 'Zaloguj się, żeby rozmawiać.' }, 401);

  const body = await req.json().catch(() => null);
  const { data: hasAccess } = await supabase.rpc('lms_has_access');
  if (!hasAccess) return json({ error: 'To konto nie ma dostępu do kursu. Napisz do nauczyciela.' }, 403);

  // read with the student's key: RLS hides drafts and locked lessons
  const { data: task } = await supabase
    .from('lms_tasks')
    .select('id, kind, title, body_md, course_id, slug, lesson_number')
    .eq('id', String(body?.taskId ?? ''))
    .maybeSingle();
  if (!task || task.kind !== 'explain') return json({ error: 'Nie ma takiego zadania.' }, 404);
  const { data: note } = await admin
    .from('lms_task_notes')
    .select('body_md')
    .eq('course_id', task.course_id)
    .eq('slug', task.slug)
    .maybeSingle();
  if (!note?.body_md) return json({ error: 'To zadanie nie ma jeszcze klucza. Napisz do nauczyciela.' }, 500);

  // the level: course, lesson and topics covered up to it (also lessons the student cannot open yet don't count)
  const [{ data: course }, { data: lessons }] = await Promise.all([
    admin.from('lms_courses').select('title').eq('id', task.course_id).maybeSingle(),
    admin
      .from('lms_lessons')
      .select('number, title, topics')
      .eq('course_id', task.course_id)
      .lte('number', task.lesson_number)
      .order('number'),
  ]);
  const level = levelText(course?.title ?? '', task.lesson_number, lessons ?? []);
  const explainTask = { title: task.title, body_md: task.body_md, level };

  const messages = cleanMessages(body?.messages);
  const said = studentMessages(messages);
  const finish = Boolean(body?.finish) || said >= MAX_STUDENT_MESSAGES;
  if (finish && said === 0) return json({ error: 'Najpierw coś wytłumacz.' }, 400);

  const { data: limit, error: limitError } = await admin.rpc('lms_use_explain', {
    p_user: auth.user.id,
    p_task: task.id,
    daily_limit: DAILY_LIMIT,
    task_limit: TASK_LIMIT,
  });
  if (limitError) return json({ error: 'Nie udało się sprawdzić limitu.' }, 500);
  if (limit === 'daily') return json({ error: 'Na dziś wykorzystano limit rozmów. Wróć jutro.' }, 429);
  if (limit === 'task') return json({ error: 'W tym zadaniu wykorzystano limit wiadomości. Napisz do nauczyciela.' }, 429);

  try {
    if (!finish) {
      const reply = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: chatSystem(explainTask, note.body_md),
        messages: [OPENER, ...messages],
      });
      if (reply.stop_reason === 'refusal') return json({ error: 'Kuba nie umie na to odpowiedzieć. Spróbuj inaczej.' }, 502);
      return json({ reply: text(reply), left: MAX_STUDENT_MESSAGES - said });
    }

    const result = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
      system: summarySystem(explainTask, note.body_md),
      messages: [{ role: 'user', content: transcript(messages) }],
    });
    if (result.stop_reason !== 'end_turn') {
      console.error('summary stopped', result.stop_reason);
      return json({ error: 'Nie udało się podsumować rozmowy. Spróbuj jeszcze raz.' }, 502);
    }
    const summary = JSON.parse(text(result)) as Summary;
    const ok = passed(summary);
    const { error } = await admin.from('lms_attempts').insert({
      user_id: auth.user.id,
      task_id: task.id,
      code: transcript(messages),
      passed: ok,
      results: { summary, messages },
    });
    if (error) console.error('attempt not saved', error);
    return json({ summary, passed: ok });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Kuba jest zajęty. Spróbuj za minutę.' }, 429);
    if (e instanceof Anthropic.APIError) console.error('Anthropic', e.status, e.message);
    else console.error(e);
    return json({ error: 'Kuba jest chwilowo niedostępny.' }, 502);
  }
});
