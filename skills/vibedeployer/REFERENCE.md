# vibedeployer API reference

Base URL: `$VIBEDEPLOYER_URL` (default `https://vibedeployer.sebous.workers.dev`).
Auth: `Authorization: Bearer <vd_...>` on every `/api/*` call.

## Endpoints

### `POST /api/docs` — create a doc (+ version 1)
Body may be raw HTML (`Content-Type: text/html`), JSON, or multipart (`file`/`html` field).
Optional fields (JSON keys, or query params for raw body): `title`, `custom_slug`, `comment`, `password`.
Pass `password` to publish a password-protected doc (see "Password protection" below).

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
# remove protection (make public again)
curl -X PUT "$VIBEDEPLOYER_URL/api/docs/u2ykan6/password" \
  -H "Authorization: Bearer $TOKEN" -d '{"password":null}'
```
Returns the serialized doc (includes `"protected": true|false`). The password is
never returned. One password per doc; it gates every version.

### `DELETE /api/docs/:slug` — delete doc + all versions
Returns `{ "deleted": true }`.

## Public (no auth)

- `GET /d/:slug` — latest version (HTML)
- `GET /d/:slug/v/:n` — pinned version `n` (HTML)
- `GET /d/:slug/meta` — JSON metadata + per-version URLs

## Password protection

If a doc has a password, the public `GET /d/...` routes return `401
{"error":"password_required"}` until you supply it. Two ways (no auth token needed):

```bash
# header
curl -H "X-Doc-Password: s3cret" "$VIBEDEPLOYER_URL/d/u2ykan6"
# query param
curl "$VIBEDEPLOYER_URL/d/u2ykan6?password=s3cret"
```

In a browser, visiting the URL shows an unlock form; once entered, a cookie keeps
it unlocked. Serialized docs report `"protected": true`.

## Errors

JSON `{ "error": "<code>", "message": "..." }` with HTTP status:

| Status | code | meaning |
|---|---|---|
| 400 | `empty_html` / `invalid_custom_slug` | bad input |
| 401 | `unauthorized` / `invalid_api_key` | missing/bad token |
| 401 | `password_required` | doc is password-protected; supply `X-Doc-Password` or `?password=` |
| 404 | `not_found` | no such doc (or not yours) |
| 409 | `slug_taken` | custom slug already used |
| 413 | `too_large` | HTML > 5 MB |

## Limits

- 5 MB per HTML file.
- Slugs: `a-z 0-9 -`, 3–64 chars, no leading/trailing/double hyphen.
- A doc is owned by the account whose API key created it; only the owner can update/delete/list it. Anyone with the link can view.
