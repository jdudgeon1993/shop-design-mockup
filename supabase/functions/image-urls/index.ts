// image-urls: short-lived signed URLs for the PRIVATE product-images bucket.
// Browsers have no storage policies on that bucket, so this is the only way
// to view a photo. Only paths indexed in public.product_images (is_active)
// are signed, so the bucket can't be listed or probed for other files.
// Deployed with verify_jwt = true (the site's anon key satisfies it).
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'product-images';
const TTL_SECONDS = 3600;
const MAX_PATHS = 120;
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

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, headers);

  let paths: unknown;
  try {
    paths = (await req.json()).paths;
  } catch {
    return json({ error: 'Body must be JSON: {"paths": [...]}' }, 400, headers);
  }
  if (!Array.isArray(paths) || !paths.length) return json({ urls: {} }, 200, headers);
  const wanted = [...new Set(paths.filter((p): p is string => typeof p === 'string'))].slice(0, MAX_PATHS);

  const { data: known, error: lookupError } = await admin
    .from('product_images').select('storage_path')
    .in('storage_path', wanted).eq('is_active', true);
  if (lookupError) return json({ error: 'Lookup failed' }, 500, headers);
  const allowed = (known ?? []).map((r) => r.storage_path as string);
  if (!allowed.length) return json({ urls: {} }, 200, headers);

  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrls(allowed, TTL_SECONDS);
  if (signError) return json({ error: 'Signing failed' }, 500, headers);

  const urls: Record<string, string> = {};
  for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  return json({ urls, expiresIn: TTL_SECONDS }, 200, headers);
});
