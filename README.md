# vibedeployer

Version & host HTML docs (the kind Claude/agents produce). Humans log in via the web; agents push via API keys. Every upload is a new immutable version with a stable "always-latest" URL plus pinned per-version URLs.

Runs entirely on **Cloudflare free tier**: a Worker (Hono) + **D1** (metadata) + **R2** (HTML blobs).

## What you get

- **Auth** — email/password sessions for humans; `vd_…` Bearer API keys for agents (SHA-256 hashed, revocable).
- **Upload** — paste/file in the dashboard, or `POST` raw HTML / JSON / multipart from an agent.
- **Versioning** — each upload increments the version; old versions stay viewable forever.
- **URLs** — auto random slug (`/d/x7k2p9q`) **and** optional custom slug (`/d/q2-report`). Public by link.
- **Password protection** — optionally lock a doc with a password. One password per doc, covering every version (not set per version); viewers get an unlock prompt before any version is served.

## Free-tier limits (today)

| Resource | Free allowance | Notes |
|---|---|---|
| Workers requests | 100k/day | |
| D1 | 5 GB storage, 5M rows read/day | metadata only |
| R2 | 10 GB storage, no egress fees | the HTML files |

Per-file cap is 5 MB (tunable: `MAX_BYTES` in `src/docs.ts`).

## Deploy

```bash
npm install
npx wrangler login

# 1. Create the D1 database, paste the printed database_id into wrangler.toml
npx wrangler d1 create vibedeployer-db

# 2. Create the R2 bucket
npx wrangler r2 bucket create vibedeployer-docs

# 3. Apply schema to the remote DB
npm run db:remote
# Upgrading an existing deployment? Apply pending migrations too:
npm run migrate:remote   # adds the docs.password_hash column

# 4. Set a real session secret
npx wrangler secret put SESSION_SECRET

# 5. Ship it
npm run deploy
```

Your Worker URL (`https://vibedeployer.<account>.workers.dev` or a custom domain) is the host.

## Local dev

```bash
npm run db:local      # seed local D1
npm run dev           # http://127.0.0.1:8787
```

## API (for agents)

Auth: `Authorization: Bearer vd_...` (mint a key in the dashboard).

```bash
# Create a doc (+ first version). Body can be raw HTML, JSON, or multipart.
curl -X POST $HOST/api/docs \
  -H "Authorization: Bearer $KEY" -H "Content-Type: text/html" \
  --data-binary @report.html
# → { "url": "https://.../d/x7k2p9q", "slug": "x7k2p9q", "version": 1, ... }

# JSON variant (set title + custom slug + optional password inline)
curl -X POST $HOST/api/docs \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<h1>hi</h1>","title":"My Doc","custom_slug":"my-doc","password":"hunter2"}'

# Push a new version to an existing doc
curl -X POST $HOST/api/docs/x7k2p9q/versions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: text/html" \
  --data-binary @report-v2.html

curl $HOST/api/docs                 -H "Authorization: Bearer $KEY"  # list
curl $HOST/api/docs/x7k2p9q         -H "Authorization: Bearer $KEY"  # get + versions
curl -X PUT $HOST/api/docs/x7k2p9q/slug -H "Authorization: Bearer $KEY" \
  -d '{"custom_slug":"renamed"}'                                     # set slug
curl -X PUT $HOST/api/docs/x7k2p9q/password -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"password":"hunter2"}'    # protect (one pass per doc)
curl -X PUT $HOST/api/docs/x7k2p9q/password -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"password":null}'         # remove protection
curl -X DELETE $HOST/api/docs/x7k2p9q -H "Authorization: Bearer $KEY"
```

Public (no auth):
- `GET /d/:slug` — latest version (protected docs show an unlock prompt first)
- `GET /d/:slug/v/:n` — pinned version
- `GET /d/:slug/meta` — JSON metadata + version list (locked docs expose only `title`/`slug`/`protected` until unlocked)
- `POST /d/:slug/unlock` — submit the password (form field `password`) to view a protected doc

## Claude skill

An agent skill in [`skills/vibedeployer`](skills/vibedeployer) lets Claude publish/version
HTML and return a URL. Install via `npx skills install ./skills/vibedeployer` (or copy it
into `~/.claude/skills/`), set `VIBEDEPLOYER_TOKEN`, then ask Claude to "publish this HTML
and give me a link." See [skills/vibedeployer/README.md](skills/vibedeployer/README.md).

## Layout

```
src/
  index.ts   entry: middleware, public doc serving, route mounting
  lib.ts     env types, ids/slugs, password + api-key crypto, doc-access cookie HMAC
  auth.ts    sessions, cookie + API-key middleware
  docs.ts    doc/version service (D1 + R2)
  api.ts     agent REST API (Bearer)
  pages.ts   human pages (signup/login/dashboard/upload/keys)
  ui.ts      HTML templates
schema.sql   D1 schema
migrations/  incremental D1 migrations for existing deployments
```

## Notes / next steps

- Served docs run in a CSP sandbox (`sandbox allow-scripts allow-forms allow-popups allow-same-origin`) to limit blast radius of arbitrary uploaded HTML.
- Password-protected docs are gated by an HMAC unlock cookie (signed with `SESSION_SECRET`, bound to the doc + its current password hash, so changing/removing the password instantly invalidates old unlocks). Protected responses are sent `Cache-Control: private, no-store`. The owner bypasses the prompt while logged into the dashboard.
- Not yet built: per-doc private/unlisted visibility (schema has the column), rate limiting, custom domains, content-dedup across versions.
