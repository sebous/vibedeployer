# vibedeployer API reference

Base URL: `$VIBEDEPLOYER_URL` (default `https://vibedeployer.sebous.workers.dev`).
Auth: `Authorization: Bearer <vd_...>` on every `/api/*` call.

## Endpoints

### `POST /api/docs` — create a doc (+ version 1)
Body may be raw HTML (`Content-Type: text/html`), JSON, or multipart (`file`/`html` field).
Optional fields (JSON keys, or query params for raw body): `title`, `custom_slug`, `comment`, `password`.

Setting `password` protects the doc: every viewer must enter it (via an unlock page) before any
version is served. It is **one password per doc**, not per version. Owners viewing while logged in to
the dashboard bypass the prompt.

```bash
# raw
curl -X POST "$VIBEDEPLOYER_URL/api/docs?custom_slug=my-doc&title=My%20Doc" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: text/html" \
  --data-binary @page.html

# json (with a password)
curl -X POST "$VIBEDEPLOYER_URL/api/docs" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"html":"<h1>hi</h1>","title":"My Doc","custom_slug":"my-doc","password":"hunter2"}'
```

Response `201`:
```json
{
  "id": "5e93...",
  "slug": "u2ykan6",
  "custom_slug": "my-doc",
  "title": "My Doc",
  "latest_version": 1,
  "protected": true,
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

### `PUT /api/docs/:slug/password` — set / change / remove the doc password
One password protects the doc across all versions. Send a string to set it, or `null` (or `""`) to remove it.
Returns the updated doc (with `"protected": true|false`).

```bash
# set or change
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/password" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"password":"hunter2"}'

# remove protection
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/password" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"password":null}'
```

### `DELETE /api/docs/:slug` — delete doc + all versions
Returns `{ "deleted": true }`.

## Public (no auth)

- `GET /d/:slug` — latest version (HTML). If protected, returns an unlock page until the viewer submits the password.
- `GET /d/:slug/v/:n` — pinned version `n` (HTML). Same password gate as above.
- `GET /d/:slug/meta` — JSON metadata + per-version URLs. For a locked doc this returns only `{ title, slug, custom_slug, protected: true, url }` until unlocked.
- `POST /d/:slug/unlock` — form field `password`; on success drops a 30-day unlock cookie and redirects to the doc.

## Errors

JSON `{ "error": "<code>", "message": "..." }` with HTTP status:

| Status | code | meaning |
|---|---|---|
| 400 | `empty_html` / `invalid_custom_slug` / `weak_password` | bad input |
| 401 | `unauthorized` / `invalid_api_key` | missing/bad token |
| 404 | `not_found` | no such doc (or not yours) |
| 409 | `slug_taken` | custom slug already used |
| 413 | `too_large` | HTML > 5 MB |

## Limits

- 5 MB per HTML file.
- Slugs: `a-z 0-9 -`, 3–64 chars, no leading/trailing/double hyphen.
- Passwords: 4+ chars. One password per doc (protects every version), not per version.
- A doc is owned by the account whose API key created it; only the owner can update/delete/list it. Anyone with the link — plus the password, if set — can view.
