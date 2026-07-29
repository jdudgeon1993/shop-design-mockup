// Design Lab's one Railway service, doing two jobs:
//
// 1. Video consultation token bridge (original purpose) — the employee
//    dashboard never holds the JaaS private key. It logs an employee in
//    through Supabase Auth directly, then calls this service with that
//    session to get back a short-lived JaaS moderator JWT.
//
// 2. Site gate (added when the storefront needed to stay private pre-launch)
//    — every other request on this domain is gated behind a real,
//    server-verified Supabase session belonging to an employee. Not
//    authenticated, or authenticated as a customer, gets coming-soon's
//    page for every path, not just "/". This reuses the exact same
//    Supabase verification job #1 already needed, which is why it lives
//    here instead of a second Railway service — one deployment, one set
//    of env vars, same as everything else already running.
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const REQUIRED_ENV = [
  'JAAS_APP_ID',
  'JAAS_KID',
  'JAAS_PRIVATE_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ALLOWED_ORIGIN'
];

for (const name of REQUIRED_ENV) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const {
  JAAS_APP_ID,
  JAAS_KID,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ALLOWED_ORIGIN
} = process.env;

// Railway env vars are single-line, but a PEM key is multi-line — accept
// either a real private key (local .env files can have real newlines) or
// one with literal "\n" escapes (how it'll usually be pasted into Railway).
const JAAS_PRIVATE_KEY = process.env.JAAS_PRIVATE_KEY.includes('\\n')
  ? process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n')
  : process.env.JAAS_PRIVATE_KEY;

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour — short-lived on purpose

const SITE_ROOT = path.join(__dirname, '..');
const GATE_COOKIE = 'dl_session';
const GATE_SESSION_MAX_AGE = 60 * 60; // matches Supabase's default access token lifetime

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

async function getSupabaseUser(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function isEmployee(accessToken, userId) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY }
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] && rows[0].role === 'employee';
}

async function verifyEmployeeSession(accessToken) {
  if (!accessToken) return null;
  const user = await getSupabaseUser(accessToken);
  if (!user || !user.id) return null;
  return (await isEmployee(accessToken, user.id)) ? user : null;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

app.post('/api/jitsi-token', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!accessToken) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  let user;
  try {
    user = await getSupabaseUser(accessToken);
  } catch (err) {
    console.error('Supabase verification failed:', err);
    return res.status(502).json({ error: 'Could not verify session' });
  }

  if (!user || !user.email) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: JAAS_APP_ID,
    room: '*',
    iat: now,
    nbf: now,
    exp: now + TOKEN_TTL_SECONDS,
    context: {
      user: {
        name: user.email,
        moderator: true
      }
    }
  };

  let token;
  try {
    token = jwt.sign(payload, JAAS_PRIVATE_KEY, {
      algorithm: 'RS256',
      header: { kid: JAAS_KID, typ: 'JWT' }
    });
  } catch (err) {
    console.error('JWT signing failed:', err);
    return res.status(500).json({ error: 'Could not sign token' });
  }

  res.json({ jwt: token, expiresIn: TOKEN_TTL_SECONDS });
});

app.get('/healthz', (req, res) => res.send('ok'));

// ---- Site gate ----
// Sign-in itself still happens client-side via Supabase, same as every
// other login on this site. The browser then POSTs the resulting access
// token here — this is what actually sets the cookie the gate below
// checks. A JS-disabled visitor just never reaches this step; they were
// never going to get past the gate either way.
app.post('/api/session', async (req, res) => {
  const user = await verifyEmployeeSession(req.body && req.body.access_token);
  if (!user) {
    return res.status(401).json({ error: "Not an employee account, or session expired." });
  }
  res.cookie(GATE_COOKIE, req.body.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: GATE_SESSION_MAX_AGE * 1000
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(GATE_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Every other request: verify the gate cookie before deciding what to send.
// Not authenticated, or authenticated but not an employee, gets the
// coming-soon page for whatever path was requested — this is the check a
// purely static host (GitHub Pages) can never do, since it has no server
// to ask.
app.use(async (req, res, next) => {
  if (req.path.startsWith('/server')) return res.status(404).end(); // never serve our own source
  const cookies = parseCookies(req.headers.cookie);
  const user = await verifyEmployeeSession(cookies[GATE_COOKIE]);
  if (user) return next();
  res.sendFile(path.join(SITE_ROOT, 'coming-soon', 'index.html'));
});

app.use(express.static(SITE_ROOT));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
