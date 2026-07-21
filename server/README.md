# Design Lab video consultation token bridge

A single-purpose service: check that a request is coming from a genuinely
logged-in employee (via Supabase Auth), and if so, sign a short-lived (1
hour) JaaS moderator JWT so the employee dashboard can start a video
consultation room with real moderator controls.

This exists so the JaaS private key never has to sit inside the static
site's public JavaScript. The site calls this service; this service is the
only thing that ever touches the key.

## Endpoints

- `POST /api/jitsi-token` — requires `Authorization: Bearer <supabase access token>`.
  Verifies the token against Supabase, then returns `{ jwt, expiresIn }`.
- `GET /healthz` — plain liveness check.

## Deploying on Railway

1. Create a new Railway service pointed at this repo, with **root directory
   set to `server/`** (Railway supports deploying a subdirectory of a
   monorepo — this keeps the backend in the same repo as the site instead
   of needing a second one).
2. Railway will detect `package.json` and run `npm install && npm start`
   automatically — no other configuration needed.
3. Set the environment variables listed in `.env.example` in the Railway
   service's Variables tab (not in a file — Railway injects them directly).
4. Once deployed, Railway gives you a public URL like
   `https://your-service.up.railway.app`. That's the `TOKEN_ENDPOINT` value
   `dashboard/index.html` (and the `proto/` copy) need.

## Local testing

```
cd server
npm install
cp .env.example .env   # fill in real values, keep this file out of git
npm start
```
