// Creates a passwordless auth account for a student the teacher enrolls.
// The login page uses shouldCreateUser: false, so nobody else can create accounts
// in this auth pool (it is shared with the Co Zabrać app).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isTeacher } = await asCaller.rpc('lms_is_teacher');
  if (!isTeacher) return json({ error: 'Tylko nauczyciel może dodawać uczniów.' }, 403);

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Niepoprawny adres e-mail.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  // An existing account (e.g. a Co Zabrać user) is fine: the enrollment alone grants access.
  if (error && !/already|exists|registered/i.test(error.message)) {
    console.error('createUser', error);
    return json({ error: 'Nie udało się założyć konta.' }, 500);
  }
  return json({ ok: true, created: !error });
});
