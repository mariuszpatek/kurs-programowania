// Language model for course tasks: ask() / chat() in the student's Python come here (src/lib/languages/python/worker.ts).
// The teacher picks the provider (Anthropic or OpenRouter) and the models in the dashboard (lms_llm_settings);
// API keys live only in Supabase secrets: ANTHROPIC_API_KEY, OPENROUTER_API_KEY.
// Every call is written to lms_llm_usage; a user over their monthly limit gets 429 before the provider is called.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCall, costOf, parseRequest, parseResponse, providerError, withoutOptionalParams, type Effort, type Provider } from '../_shared/providers.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const KEYS: Record<Provider, string> = { anthropic: 'ANTHROPIC_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await asCaller.auth.getUser();
  if (!auth.user) return json({ error: 'Zaloguj się, żeby korzystać z modelu.' }, 401);
  const [{ data: hasAccess }, { data: isTeacher }] = await Promise.all([asCaller.rpc('lms_has_access'), asCaller.rpc('lms_is_teacher')]);
  if (!hasAccess && !isTeacher) return json({ error: 'To konto nie ma dostępu do kursu.' }, 403);

  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const email = auth.user.email!.toLowerCase();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: settings }, { data: override }, { data: usage }] = await Promise.all([
    admin.from('lms_llm_settings').select('*').eq('id', 1).single(),
    admin.from('lms_llm_limits').select('monthly_limit_usd').eq('email', email).maybeSingle(),
    admin.from('lms_llm_usage').select('cost_usd').eq('user_id', auth.user.id).gte('created_at', monthStart),
  ]);
  if (!settings) return json({ error: 'Model nie jest skonfigurowany (brak lms_llm_settings).' }, 500);

  const limit = Number(override?.monthly_limit_usd ?? (isTeacher ? settings.teacher_monthly_limit_usd : settings.student_monthly_limit_usd));
  const spent = (usage ?? []).reduce((sum, u) => sum + Number(u.cost_usd), 0);
  if (spent >= limit) {
    return json({ error: `Wykorzystano miesięczny limit na model (${spent.toFixed(2)} z ${limit.toFixed(2)} USD). Napisz do nauczyciela.` }, 429);
  }

  const provider = settings.provider as Provider;
  const model = provider === 'anthropic' ? settings.anthropic_model : settings.openrouter_model;
  const apiKey = Deno.env.get(KEYS[provider]);
  if (!apiKey) return json({ error: `Brak klucza ${KEYS[provider]} w sekretach funkcji. Napisz do nauczyciela.` }, 500);

  const send = (r: typeof parsed) => {
    const call = buildCall(provider, model, apiKey, r);
    return fetch(call.url, { method: 'POST', headers: call.headers, body: JSON.stringify(call.body) });
  };
  const request = { ...parsed, effort: (settings.effort ?? undefined) as Effort | undefined };
  let response = await send(request);
  let dropped: string[] = [];
  const retry = response.status === 400 ? withoutOptionalParams(request) : null;
  if (retry) {
    // the model does not take temperature (newer models) or effort (older ones): ask again without them
    console.warn(provider, model, '400, retrying without', retry.dropped.join(', '), await response.text());
    response = await send(retry.request);
    dropped = retry.dropped;
  }
  if (!response.ok) {
    console.error(provider, response.status, await response.text());
    const e = providerError(response.status);
    return json({ error: e.message }, e.status);
  }
  const result = parseResponse(provider, await response.json());
  const cost = costOf(result, {
    input_price_per_mtok: Number(settings.input_price_per_mtok),
    output_price_per_mtok: Number(settings.output_price_per_mtok),
  });

  const { error } = await admin.from('lms_llm_usage').insert({
    user_id: auth.user.id,
    provider,
    model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    cost_usd: cost,
  });
  if (error) console.error('usage', error.message);

  return json({
    text: result.text,
    provider,
    model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    stop_reason: result.stop_reason,
    dropped,
    cost_usd: cost,
    spent_usd: spent + cost,
    limit_usd: limit,
  });
});
