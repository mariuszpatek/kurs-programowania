import { createClient, type User } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
  // implicit rather than PKCE: the magic link also works when opened in a different browser than the one that requested it
  auth: { flowType: 'implicit' },
});

export async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}
