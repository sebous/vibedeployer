---
name: vibedeployer
description: Publish and version HTML documents to vibedeployer (Cloudflare-hosted) and return a shareable URL. Use when the user asks to host, publish, share, or deploy an HTML file/page/report/artifact, wants a link to send someone, or to update/re-version a previously published doc.
---

# vibedeployer

Host an HTML file and get a stable, shareable URL. Every upload is a new version; the
main URL always serves the latest, and each version keeps its own permanent URL.

## Setup (once)

Requires an API key (`vd_...`) from the dashboard → "API keys". Export it:

```bash
export VIBEDEPLOYER_TOKEN="vd_xxxxxxxx"
# optional, only if self-hosted on a different host:
export VIBEDEPLOYER_URL="https://vibedeployer.sebous.workers.dev"
```

If `VIBEDEPLOYER_TOKEN` is unset, ask the user for their key before proceeding.

## Quick start

Use the bundled script (`curl`-only, no install). From the skill dir:

```bash
# Publish a new doc → prints JSON with the "url"
scripts/vibedeploy.sh create report.html --title "Q2 Report" --slug q2-report

# Publish a password-protected doc (viewers must enter the password)
scripts/vibedeploy.sh create report.html --slug q2-report --password "hunter2"

# Update it later → bumps to the next version, same URL serves latest
scripts/vibedeploy.sh push q2-report report.html --comment "fixed totals"
```

Then give the user the `"url"` field from the response.

## Workflow

1. Ensure the HTML exists as a file. If you generated it inline, write it to a `.html` file first.
2. Ensure `VIBEDEPLOYER_TOKEN` is set (ask the user if not).
3. New page → `create`. Updating an existing page → `push <slug>`.
4. If the user wants the doc private, pass `--password` on `create` (or run `password <slug> <pass>` later).
   The password protects the whole doc — set it once, **not per version**. Give the password to the
   user (and anyone they want to share with) over a separate channel; the link alone won't open it.
5. Report the returned `url` (latest) to the user. Mention the per-version URL only if they need to pin a version.

## Commands

| Command | Purpose |
|---|---|
| `create <file.html> [--slug NAME] [--title T] [--password PASS]` | New doc + version 1 |
| `push <slug> <file.html> [--comment MSG]` | Add a new version |
| `list` | List your docs |
| `get <slug>` | Doc + version history |
| `password <slug> <PASS>` | Set/change the doc password (one per doc) |
| `unprotect <slug>` | Remove the doc password |
| `delete <slug>` | Delete a doc and all versions |

`--slug` is optional; without it a random short slug is generated. Slugs are
`a-z 0-9 -`, 3–64 chars. Files cap at 5 MB. Passwords are 4+ chars and protect
every version of the doc (one password per doc, not per version).

## Raw API (no script)

```bash
curl -X POST "$VIBEDEPLOYER_URL/api/docs" \
  -H "Authorization: Bearer $VIBEDEPLOYER_TOKEN" \
  -H "Content-Type: text/html" --data-binary @page.html
```

Full endpoint reference and response shapes: see [REFERENCE.md](REFERENCE.md).
