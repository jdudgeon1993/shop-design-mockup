# admin.shopdesignlab.com — internal preview hosting on Railway

Two Railway services, both running `static-server.js` from this same repo,
each tracking a different branch. This replaces the manual `proto/` mirror —
once this is set up, an entire in-progress branch is live automatically,
including files that never got hand-copied into `proto/`.

- `shopdesignlab.com` (the real production site) stays exactly as it is —
  hosted on **GitHub Pages**, tracking `main`. Nothing about that changes.
- `admin.shopdesignlab.com` — a **new** Railway service, root directory `/`
  (the repo root), tracking the `main` branch. A Railway-hosted mirror of
  production, for internal use.
- `preview.admin.shopdesignlab.com` — a **second** new Railway service,
  same code, root directory `/`, but tracking whatever branch is
  currently being worked on (e.g. `claude/layout-overflow-responsive-pcbltx`).
  Every push to that branch redeploys it automatically — Railway does this
  natively, no webhook or extra config needed.

## One-time setup per service (repeat twice)

1. Railway → New Service → Deploy from GitHub repo → this repo.
2. Root directory: leave as `/` (the repo root — unlike the `server/`
   service, this one needs the whole site tree, not a subfolder).
3. Railway auto-detects Node via `package.json` and runs `npm start`
   (`node static-server.js`) — no other build config needed.
4. Settings → set the branch to track: `main` for the first service,
   the current working branch for the second.
5. Settings → Networking → add a custom domain:
   `admin.shopdesignlab.com` on the first service,
   `preview.admin.shopdesignlab.com` on the second.
6. At your DNS provider (name.com), add a CNAME record for each:
   - Host `admin` → the target Railway gives you for that service
   - Host `preview.admin` → the target Railway gives you for that service
   (Railway shows the exact CNAME target to use once you add the domain —
   it's a `*.up.railway.app`-style value, not a fixed IP like GitHub Pages.)

## The one manual step that remains

Whenever a brand new working branch starts (a new name, not just new
commits on the same branch), go to the `preview.admin` service's Settings
and change which branch it tracks to the new name. Every *push* to an
already-tracked branch redeploys automatically with zero manual steps —
it's only the initial branch *name* that needs pointing at, same as
setting up a new PR preview on any platform.

## Why not the `serve` npm package

`static-server.js` is a small dependency-free file instead of using
`serve` (the obvious off-the-shelf choice) because, as of when this was
written, `serve`'s dependency chain (`serve` → `serve-handler` →
`minimatch` → `brace-expansion`) carries an unpatched high-severity DoS
advisory (GHSA-mh99-v99m-4gvg) in every currently published version.
Writing a plain static file server is a small enough job that avoiding
that dependency entirely was easier than taking on the risk.
