# vibedeployer API reference

Base URL: `$VIBEDEPLOYER_URL` (default `https://vibedeployer.sebous.workers.dev`).
Auth: `Authorization: Bearer <vd_...>` on every `/api/*` call.

## Endpoints

### `POST /api/docs` — create a doc (+ version 1)
Body may be raw HTML (`Content-Type: text/html`), JSON, or multipart (`file`/`html` field).
Optional fields (JSON keys, or query params for raw body): `title`, `custom_slug`, `comment`, `password`, `visibility`.
`visibility` is `team`, `password`, or `public` (see "Access" below). Without it:
`password` given → `password`; owner in a team → `team`; otherwise → `password`.
If the mode needs a password and none was given, one is generated and returned
once as `"password"` in the response.

```bash
# raw
curl -X POST "$VIBEDEPLOYER_URL/api/docs?custom_slug=my-doc&title=My%20Doc" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: text/html" \
  --data-binary @page.html

# json
curl -X POST "$VIBEDEPLOYER_URL/api/docs" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"html":"<h1>hi</h1>","title":"My Doc","custom_slug":"my-doc"}'
```

Response `201`:
```json
{
  "id": "5e93...",
  "slug": "u2ykan6",
  "custom_slug": "my-doc",
  "title": "My Doc",
  "latest_version": 1,
  "url": "https://.../d/my-doc",
  "version": 1
}
```

### `POST /api/docs/:slug/versions` — add a new version
Same body formats. `:slug` is the random slug or the custom slug. Optional `comment`.
Returns the doc with the new `version` number.

### `GET /api/docs` — list your docs
```json
{ "docs": [ { "id": "...", "slug": "...", "url": "...", "latest_version": 2, ... } ] }
```

### `GET /api/docs/:slug` — doc + version history
```json
{ "title": "...", "slug": "...", "latest_version": 2,
  "versions": [ { "version": 2, "size": 1179, "comment": null, "created_at": 1780601206031 } ] }
```

### `PUT /api/docs/:slug/slug` — set/change custom slug
```bash
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/slug" \
  -H "Authorization: Bearer $TOKEN" -d '{"custom_slug":"renamed"}'
```

### `PUT /api/docs/:slug/password` — set / rotate / remove password
```bash
# set or rotate
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/password" \
  -H "Authorization: Bearer $TOKEN" -d '{"password":"s3cret"}'
# remove the password (team docs only → team-only access)
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/password" \
  -H "Authorization: Bearer $TOKEN" -d '{"password":null}'
```
Returns the serialized doc. The password is never returned. One password per
doc; it gates every version. Setting a password on a `public` doc switches it to
`password`. Removing it from a `password` doc fails with `password_required`.

### `PUT /api/docs/:slug/visibility` — change access mode
```bash
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/visibility" \
  -H "Authorization: Bearer $TOKEN" -d '{"visibility":"team"}'
```
Returns the serialized doc, plus a generated `"password"` when the new mode
needs one and the doc had none. `team` fails with `no_team` if your account is
not in a team.

### `DELETE /api/docs/:slug` — delete doc + all versions
Returns `{ "deleted": true }`.

## Viewing (no API token)

- `GET /d/:slug` — latest version (HTML)
- `GET /d/:slug/v/:n` — pinned version `n` (HTML)
- `GET /d/:slug/meta` — JSON metadata + per-version URLs

## Access

| `visibility` | Who can view |
|---|---|
| `team` | Members of the owner's team (Google sign-in), the owner, and anyone with the password |
| `password` | The owner and anyone with the password |
| `public` | Anyone with the link |

Serialized docs include `"visibility"`, `"protected"` (true unless public) and
`"has_password"`. Blocked `GET /d/...` requests return `401
{"error":"access_denied","visibility":"..."}`. Supply the password (no API token needed):

```bash
# header
curl -H "X-Doc-Password: s3cret" "$VIBEDEPLOYER_URL/d/u2ykan6"
# query param
curl "$VIBEDEPLOYER_URL/d/u2ykan6?password=s3cret"
```

In a browser, the page offers Google sign-in (team docs) and a password form;
a cookie keeps it unlocked.

Docs are served in a sandbox without their own origin, so a doc's scripts
cannot use `localStorage`, `sessionStorage`, IndexedDB, or `document.cookie`.

## Errors

JSON `{ "error": "<code>", "message": "..." }` with HTTP status:

| Status | code | meaning |
|---|---|---|
| 400 | `empty_html` / `invalid_custom_slug` / `invalid_visibility` | bad input |
| 400 | `no_team` | `team` mode requested but your account is not in a team |
| 400 | `password_required` | tried to remove the password from a `password` doc |
| 401 | `unauthorized` / `invalid_api_key` | missing/bad token |
| 401 | `access_denied` | viewer can't see the doc; supply `X-Doc-Password` or `?password=` |
| 404 | `not_found` | no such doc (or not yours) |
| 409 | `slug_taken` | custom slug already used |
| 413 | `too_large` | HTML > 5 MB |

## Limits

- 5 MB per HTML file.
- Slugs: `a-z 0-9 -`, 3–64 chars, no leading/trailing/double hyphen.
- A doc is owned by the account whose API key created it; only the owner can update/delete/list it. Who can view depends on `visibility`.
