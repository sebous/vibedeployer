# vibedeployer

Version & host HTML docs (the kind Claude/agents produce). Humans log in via the web; agents push via API keys. Every upload is a new immutable version with a stable "always-latest" URL plus pinned per-version URLs.

Runs entirely on **Cloudflare free tier**: a Worker (Hono) + **D1** (metadata) + **R2** (HTML blobs).

## What you get

- **Auth** — Google sign-in for humans; `vd_…` Bearer API keys for agents (SHA-256 hashed, revocable).
- **Teams** — a team is a company (e.g. STRV) with a sign-in method set up by an admin. Today the method is Google Workspace: a Google account joins the team when its verified Workspace domain is one of the team's domains. One team per account.
- **Upload** — paste/file in the dashboard, or `POST` raw HTML / JSON / multipart from an agent.
- **Versioning** — each upload increments the version; old versions stay viewable forever.
- **URLs** — auto random slug (`/d/x7k2p9q`) **and** optional custom slug (`/d/q2-report`).
- **Access (private by default)** — each doc is `team` (teammates via Google sign-in, everyone else via password), `password` (everyone needs the password), or `public` (opt-in). A password is generated when needed and shown once. Unlock via the browser form, or an `X-Doc-Password` header / `?password=` query for agents.

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

# 4. Set secrets
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ADMIN_EMAILS        # e.g. you@company.com

# 5. Set GOOGLE_CLIENT_ID in wrangler.toml [vars], then ship it
npm run deploy
```

### Google sign-in

In Google Cloud Console → APIs & Services → Credentials, create an **OAuth
client ID** (type: Web application) with the redirect URI
`https://<your-host>/auth/google/callback`. Set the OAuth consent screen to
**External** so accounts from any company can sign in. Put the client ID in
`GOOGLE_CLIENT_ID` and the secret in `GOOGLE_CLIENT_SECRET`.

### Teams (admin)

Admins are the emails in `ADMIN_EMAILS` (comma-separated). Sign in with Google,
open `/admin`, and create a team with its Workspace domains (e.g. `strv.com`).
Users join on their next Google sign-in; existing Google users with a matching
domain join right away.

### Upgrading an existing deployment

```bash
npx wrangler d1 execute vibedeployer-db --remote --file=./migrations/0002_teams.sql
```

This removes email/password login (everyone signs in again with Google; an
account with the same email is linked), turns docs that had a password into
`password` docs, and marks other existing docs as legacy public. Then on
`/admin`: create the teams, and click **Migrate legacy docs**. Each legacy doc
moves to its owner's team (by email domain) or to `password`, and gets a new
password. The passwords are shown once on the result page; copy them.

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

# JSON variant (set title + custom slug inline)
curl -X POST $HOST/api/docs \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<h1>hi</h1>","title":"My Doc","custom_slug":"my-doc"}'

# Push a new version to an existing doc
curl -X POST $HOST/api/docs/x7k2p9q/versions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: text/html" \
  --data-binary @report-v2.html

curl $HOST/api/docs                 -H "Authorization: Bearer $KEY"  # list
curl $HOST/api/docs/x7k2p9q         -H "Authorization: Bearer $KEY"  # get + versions
curl -X PUT $HOST/api/docs/x7k2p9q/slug -H "Authorization: Bearer $KEY" \
  -d '{"custom_slug":"renamed"}'                                     # set slug
curl -X PUT $HOST/api/docs/x7k2p9q/visibility -H "Authorization: Bearer $KEY" \
  -d '{"visibility":"public"}'          # team | password | public
curl -X PUT $HOST/api/docs/x7k2p9q/password -H "Authorization: Bearer $KEY" \
  -d '{"password":"s3cret"}'            # set/rotate ({"password":null} removes it on team docs)
curl -X DELETE $HOST/api/docs/x7k2p9q -H "Authorization: Bearer $KEY"
```

Viewing (no API token; access depends on the doc's mode):
- `GET /d/:slug` — latest version
- `GET /d/:slug/v/:n` — pinned version
- `GET /d/:slug/meta` — JSON metadata + version list

### Access modes

| Mode | Who can view |
|---|---|
| `team` | Members of the owner's team (after Google sign-in), plus anyone with the password |
| `password` | Anyone with the password |
| `public` | Anyone with the link |

Default at create: `password` if you pass one; else `team` if you're in a team;
else `password`. If no password is given, one is generated and returned once as
`"password"`. Blocked requests get `401 access_denied`; supply the password by
header or query:

```bash
curl -H "X-Doc-Password: s3cret" $HOST/d/x7k2p9q     # header
curl "$HOST/d/x7k2p9q?password=s3cret"               # query param
```

In a browser the page offers Google sign-in and a password form; a cookie keeps
the doc unlocked.

### Doc sandbox

Docs are arbitrary HTML, so they are served with a CSP `sandbox` **without**
`allow-same-origin`. Their scripts run in an opaque origin and cannot use the
viewer's session to call `/api` or `/app`. Side effect: docs can't use
`localStorage`, `sessionStorage`, IndexedDB, or `document.cookie`. The planned
next step is serving docs from a separate registered domain, which removes that
limit. All cookie-authenticated `POST`/`PUT`/`DELETE` requests from another
origin are rejected (403).

## Claude skill

An agent skill in [`skills/vibedeployer`](skills/vibedeployer) lets Claude publish/version
HTML and return a URL. Install via `npx skills install ./skills/vibedeployer` (or copy it
into `~/.claude/skills/`), set `VIBEDEPLOYER_TOKEN`, then ask Claude to "publish this HTML
and give me a link." See [skills/vibedeployer/README.md](skills/vibedeployer/README.md).

## Layout

```
src/
  index.ts   entry: middleware, public doc serving, route mounting
  lib.ts     env types, ids/slugs, password + api-key crypto
  auth.ts    sessions, doc view rules, admin + API-key + CSRF middleware
  google.ts  Google sign-in (OAuth) and team assignment
  teams.ts   teams, team domains, legacy doc migration
  admin.ts   /admin pages
  docs.ts    doc/version service (D1 + R2)
  api.ts     agent REST API (Bearer)
  pages.ts   human pages (login/dashboard/upload/keys)
  ui.ts      HTML templates
schema.sql   D1 schema
```

## Notes / next steps

- **Upgrading an existing deployment** for password protection: run the migration once —
  `npx wrangler d1 execute vibedeployer-db --remote --file=./migrations/0001_doc_password.sql`
  (fresh installs get the column from `schema.sql`).
- Protected docs are served with `Cache-Control: private, no-store`; unlock cookies are stateless HMACs over `SESSION_SECRET`, so rotating/removing a password instantly revokes prior unlocks.
- Not yet built: separate domain for served docs, sign-in methods other than Google (e.g. OIDC for Microsoft/Okta), rate limiting, content-dedup across versions.
