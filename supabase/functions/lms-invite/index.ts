// Creates a passwordless auth account for a student the teacher enrolls.
// The login page uses shouldCreateUser: false, so nobody else can create accounts
// in this auth pool (it is shared with the Co Zabrać app).
//
// With { email, password } it sets the password of an enrolled student instead, for when the
// login link does not arrive. Only accounts enrolled in a course: the pool is shared with Co Zabrać,
// so this would also change the password a student uses there.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** The auth admin API has no lookup by e-mail; the pool is small, so page through it. */
async function findUser(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user || data.users.length < 1000) return user ?? null;
  }
  return null;
}

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

  if (body?.password !== undefined) {
    const password = String(body.password);
    if (password.length < 8) return json({ error: 'Hasło musi mieć co najmniej 8 znaków.' }, 400);
    const { count } = await admin.from('lms_enrollments').select('email', { count: 'exact', head: true }).eq('email', email);
    if (!count) return json({ error: 'Hasło można ustawić tylko uczniowi zapisanemu na kurs.' }, 403);
    const user = await findUser(admin, email);
    if (!user) return json({ error: 'Ten uczeń nie ma jeszcze konta.' }, 404);
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) {
      console.error('updateUserById', error);
      return json({ error: 'Nie udało się ustawić hasła.' }, 500);
    }
    return json({ ok: true });
  }

  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  // An existing account (e.g. a Co Zabrać user) is fine: the enrollment alone grants access.
  if (error && !/already|exists|registered/i.test(error.message)) {
    console.error('createUser', error);
    return json({ error: 'Nie udało się założyć konta.' }, 500);
  }
  return json({ ok: true, created: !error });
});
