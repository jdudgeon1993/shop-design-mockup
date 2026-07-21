// Design Lab video consultation token bridge.
//
// The employee dashboard (dashboard/index.html) never holds the JaaS
// private key. It logs an employee in through Supabase Auth directly
// (Supabase's own hosted service verifies the password), then calls this
// service with that Supabase session to get back a short-lived JaaS
// moderator JWT. This is the only place the private key ever lives.
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

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

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));

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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
