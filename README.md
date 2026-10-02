# Design Lab — shopdesignlab.com

Static site served by GitHub Pages from `main`, backed by Supabase.

| Path | Page |
|---|---|
| `/` | Coming soon (pre-launch access code; `Assets/site-gate.js` gates the other pages, 5 idle minutes) |
| `/home/` | Storefront homepage |
| `/diy-wizard/` | DIY Shop: full catalog, filters, product configurator |
| `/collections/` | Curated Collections (flat price per door style) |
| `/cart/` | Cart and order submission (`place_order()`, no payment; invoiced later) |
| `/consultation/` | Client video consultation (join by room code) |
| `/dashboard/` | Employee dashboard: sign in, video rooms, recent orders, team calendar |
| `/about/` | About us |

- `Assets/dl-core.js` — shared Supabase client, money formatting and the localStorage cart.
- `database/` — Supabase schema migrations (see its README).
- `server/` — Railway service that signs video-call (JaaS) moderator tokens for employees.
- `proto/` — early prototypes kept for reference (not linked from the live site).

Changes go through pull requests; merging to `main` deploys.
