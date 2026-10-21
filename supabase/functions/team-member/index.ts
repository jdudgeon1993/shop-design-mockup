// team-member: admins add team members and reset their passwords from the dashboard.
// Creating a sign-in needs the service role, so it can't happen in the browser.
// Only callers with the 'admin' tag (public.profile_tags) get through.
//
//   POST {action:'add', email, full_name, phone?, tags?: string[]}
//        -> {id, email, password}   a new account with a temporary password, or
//        -> {id, email, existing:true}   an existing account (e.g. a customer) moved onto the team
//   POST {action:'reset', id}  -> {id, email, password}
//
// Temporary passwords are shown to the admin once, to pass on. The member is asked
// to choose their own the first time they sign in (user_metadata.must_change_password).
// Deployed with verify_jwt = true.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://shopdesignlab.com',
  'https://www.shopdesignlab.com',
  'http://localhost:8765',
];

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Easy to read out loud or type: no 0/O, 1/l/I.
function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(bytes, (b) => abc[b % abc.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, headers);

  // Who's asking, and are they an admin?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller?.user) return json({ error: 'Sign in first.' }, 401, headers);
  const { data: isAdmin } = await admin.from('profile_tags').select('tag')
    .eq('profile_id', caller.user.id).eq('tag', 'admin').maybeSingle();
  if (!isAdmin) return json({ error: 'Only admins can do that.' }, 403, headers);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON.' }, 400, headers); }

  if (body.action === 'reset') {
    const id = String(body.id ?? '');
    const { data: p } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
    if (!p || (p.role !== 'employee' && p.role !== 'admin')) return json({ error: 'That person isn\'t on the team.' }, 404, headers);
    const password = tempPassword();
    const { data, error } = await admin.auth.admin.updateUserById(id, { password, user_metadata: { must_change_password: true } });
    if (error || !data.user) return json({ error: 'Couldn\'t reset the password.' }, 500, headers);
    return json({ id, email: data.user.email, password }, 200, headers);
  }

  if (body.action !== 'add') return json({ error: 'Unknown action.' }, 400, headers);

  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.full_name ?? '').trim().slice(0, 80);
  const phone = String(body.phone ?? '').trim().slice(0, 30) || null;
  if (!EMAIL.test(email)) return json({ error: 'Enter a valid email.' }, 400, headers);
  if (!fullName) return json({ error: 'Enter their name.' }, 400, headers);

  // Only member tags that exist.
  const asked = Array.isArray(body.tags) ? [...new Set(body.tags.map(String))] : [];
  const { data: memberTags } = await admin.from('tags').select('slug').contains('applies_to', ['member']);
  const tags = asked.filter((t) => (memberTags ?? []).some((m) => m.slug === t));

  let id: string | null = null, password: string | null = null;
  const { data: found } = await admin.rpc('team_user_id_by_email', { p_email: email });
  if (found) {
    id = found as string;
    const { data: p } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
    if (p && (p.role === 'employee' || p.role === 'admin')) return json({ error: 'They\'re already on the team.' }, 409, headers);
  } else {
    password = tempPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true },
    });
    if (error || !data.user) return json({ error: 'Couldn\'t create the account.' }, 500, headers);
    id = data.user.id;
  }

  // The on_auth_user_created trigger made a customer profile; put them on the team.
  const { error: upErr } = await admin.from('profiles')
    .upsert({ id, role: 'employee', full_name: fullName, phone }, { onConflict: 'id' });
  if (upErr) return json({ error: 'The account was made, but couldn\'t be added to the team.' }, 500, headers);
  if (tags.length) {
    const { error: tagErr } = await admin.from('profile_tags')
      .insert(tags.map((tag) => ({ profile_id: id, tag, added_by: caller.user.id })));
    if (tagErr) return json({ error: 'Added to the team, but the tags didn\'t save. Set them in Team.', id, email, password }, 207, headers);
  }
  return json(password ? { id, email, password } : { id, email, existing: true }, 200, headers);
});
