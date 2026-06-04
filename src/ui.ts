import { escapeHtml } from "./lib";
import { Doc, Version } from "./docs";

const STYLE = `
:root{--bg:#0b0d12;--panel:#13161d;--panel2:#1a1e27;--line:#262b36;--fg:#e6e9ef;--mut:#8b93a3;--acc:#6ea8fe;--acc2:#9b8cff;--ok:#3fb950;--bad:#f85149}
*{box-sizing:border-box}
body{margin:0;font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:880px;margin:0 auto;padding:24px 20px 80px}
header.top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);background:var(--panel)}
header.top .brand{font-weight:700;font-size:18px;letter-spacing:-.3px}
header.top .brand span{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.muted{color:var(--mut)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0}
.card h2{margin:0 0 14px;font-size:16px}
label{display:block;font-size:13px;color:var(--mut);margin:12px 0 6px}
input,textarea,select{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--fg);padding:10px 12px;font:inherit}
textarea{min-height:200px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
input[type=file]{padding:8px}
button,.btn{display:inline-block;background:var(--acc);color:#08111f;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}
button.ghost,.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
button.danger{background:transparent;color:var(--bad);border:1px solid var(--bad)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.grid{display:grid;gap:12px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);font-size:14px}
th{color:var(--mut);font-weight:500}
code,kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:2px 6px;font-size:13px}
pre{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto;font-size:13px}
.flash{padding:12px 14px;border-radius:8px;margin:14px 0;font-size:14px}
.flash.err{background:rgba(248,81,73,.12);border:1px solid var(--bad);color:#ffb4ae}
.flash.ok{background:rgba(63,185,80,.12);border:1px solid var(--ok);color:#9ff0a8}
.pill{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mut)}
.hero{padding:48px 0 24px}.hero h1{font-size:34px;margin:0 0 10px;letter-spacing:-1px}
.keybox{background:#0e1320;border:1px dashed var(--acc);border-radius:8px;padding:12px;word-break:break-all;font-family:ui-monospace,monospace}
`;

export function layout(title: string, body: string, user?: { email: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · vibedeployer</title><style>${STYLE}</style></head>
<body>
<header class="top">
  <a class="brand" href="/"><span>vibedeployer</span></a>
  <nav class="row">
    ${
      user
        ? `<span class="muted">${escapeHtml(user.email)}</span><a class="btn ghost" href="/app">Dashboard</a><a class="btn ghost" href="/logout">Log out</a>`
        : `<a class="btn ghost" href="/login">Log in</a><a class="btn" href="/signup">Sign up</a>`
    }
  </nav>
</header>
<div class="wrap">${body}</div>
</body></html>`;
}

export function flash(msg: string | undefined, kind: "err" | "ok" = "err"): string {
  return msg ? `<div class="flash ${kind}">${escapeHtml(msg)}</div>` : "";
}

export function landingPage(): string {
  return `<div class="hero">
    <h1>Host & version HTML, instantly.</h1>
    <p class="muted" style="font-size:18px;max-width:620px">Upload an HTML file — get a unique URL. Every upload is a new version with full history. Built for humans <em>and</em> agents: log in via the web, or push with an API key.</p>
    <div class="row" style="margin-top:20px"><a class="btn" href="/signup">Get started — free</a><a class="btn ghost" href="/login">Log in</a></div>
  </div>
  <div class="card"><h2>For agents (API)</h2>
  <pre>curl -X POST https://YOUR-HOST/api/docs \\
  -H "Authorization: Bearer vd_your_key" \\
  -H "Content-Type: text/html" \\
  --data-binary @report.html
# → { "url": "https://YOUR-HOST/d/x7k2p9q", "version": 1 }</pre></div>`;
}

export function authPage(mode: "login" | "signup", err?: string): string {
  const isLogin = mode === "login";
  return `<div class="card" style="max-width:420px;margin:40px auto">
    <h2>${isLogin ? "Log in" : "Create your account"}</h2>
    ${flash(err)}
    <form method="post" action="/${mode}">
      <label>Email</label><input name="email" type="email" required autofocus>
      <label>Password</label><input name="password" type="password" required minlength="8">
      <div style="margin-top:18px" class="row">
        <button type="submit">${isLogin ? "Log in" : "Sign up"}</button>
        <a class="muted" href="/${isLogin ? "signup" : "login"}">${isLogin ? "Need an account?" : "Have an account?"}</a>
      </div>
    </form>
  </div>`;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
}

export function dashboard(opts: {
  origin: string;
  docs: Doc[];
  keys: ApiKeyRow[];
  newKey?: string;
  flashMsg?: string;
  flashKind?: "ok" | "err";
}): string {
  const { origin, docs, keys } = opts;
  const docRows = docs.length
    ? docs
        .map((d) => {
          const url = `/d/${d.custom_slug ?? d.slug}`;
          return `<tr>
        <td><a href="/app/doc/${d.id}">${escapeHtml(d.title)}</a><br><a class="muted" href="${url}" target="_blank">${escapeHtml(origin + url)}</a></td>
        <td><span class="pill">v${d.latest_version}</span></td>
        <td class="muted">${fmtDate(d.updated_at)}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="muted">No docs yet — upload one below.</td></tr>`;

  const keyRows = keys.length
    ? keys
        .map(
          (k) => `<tr>
        <td>${escapeHtml(k.name)}</td>
        <td><code>${escapeHtml(k.prefix)}…</code></td>
        <td class="muted">${k.last_used_at ? fmtDate(k.last_used_at) : "never"}</td>
        <td><form method="post" action="/app/keys/${k.id}/revoke" onsubmit="return confirm('Revoke this key?')"><button class="danger" type="submit">Revoke</button></form></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No API keys yet.</td></tr>`;

  return `
  ${opts.flashMsg ? flash(opts.flashMsg, opts.flashKind ?? "ok") : ""}
  ${
    opts.newKey
      ? `<div class="card"><h2>New API key — copy it now</h2><p class="muted">This is the only time the full key is shown.</p><div class="keybox">${escapeHtml(opts.newKey)}</div></div>`
      : ""
  }

  <div class="card"><h2>Upload HTML</h2>
    <form method="post" action="/app/docs" enctype="multipart/form-data">
      <label>HTML file</label><input type="file" name="file" accept=".html,.htm,text/html">
      <label>…or paste HTML</label><textarea name="html" placeholder="&lt;!doctype html&gt;…"></textarea>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Title (optional)</label><input name="title" placeholder="auto-detected from &lt;title&gt;"></div>
        <div><label>Custom slug (optional)</label><input name="custom_slug" placeholder="my-report"></div>
      </div>
      <div style="margin-top:16px"><button type="submit">Publish</button></div>
    </form>
  </div>

  <div class="card"><h2>Your docs</h2>
    <table><thead><tr><th>Doc</th><th>Version</th><th>Updated</th></tr></thead><tbody>${docRows}</tbody></table>
  </div>

  <div class="card"><h2>API keys</h2>
    <form method="post" action="/app/keys" class="row" style="margin-bottom:14px">
      <input name="name" placeholder="key name (e.g. claude-agent)" required style="max-width:280px">
      <button type="submit">Create key</button>
    </form>
    <table><thead><tr><th>Name</th><th>Prefix</th><th>Last used</th><th></th></tr></thead><tbody>${keyRows}</tbody></table>
  </div>`;
}

export function docDetail(opts: { origin: string; doc: Doc; versions: Version[]; flashMsg?: string; flashKind?: "ok" | "err" }): string {
  const { origin, doc, versions } = opts;
  const liveUrl = `/d/${doc.custom_slug ?? doc.slug}`;
  const verRows = versions
    .map(
      (v) => `<tr>
      <td><span class="pill">v${v.version}</span>${v.version === doc.latest_version ? ' <span class="pill" style="color:var(--ok)">latest</span>' : ""}</td>
      <td><a href="/d/${doc.slug}/v/${v.version}" target="_blank">view</a></td>
      <td class="muted">${(v.size / 1024).toFixed(1)} KB</td>
      <td class="muted">${escapeHtml(v.comment ?? "")}</td>
      <td class="muted">${fmtDate(v.created_at)}</td>
    </tr>`,
    )
    .join("");

  return `
  <p><a href="/app">← Dashboard</a></p>
  ${opts.flashMsg ? flash(opts.flashMsg, opts.flashKind ?? "ok") : ""}
  <div class="card">
    <h2>${escapeHtml(doc.title)}</h2>
    <p>Live URL: <a href="${liveUrl}" target="_blank">${escapeHtml(origin + liveUrl)}</a> <span class="pill">always latest</span></p>
    <p class="muted">Random slug: <code>${escapeHtml(doc.slug)}</code></p>
    <form method="post" action="/app/doc/${doc.id}/slug" class="row">
      <input name="custom_slug" value="${escapeHtml(doc.custom_slug ?? "")}" placeholder="custom-slug" style="max-width:280px">
      <button type="submit">Set custom slug</button>
    </form>
  </div>

  <div class="card"><h2>Upload new version</h2>
    <form method="post" action="/app/doc/${doc.id}/versions" enctype="multipart/form-data">
      <label>HTML file</label><input type="file" name="file" accept=".html,.htm,text/html">
      <label>…or paste HTML</label><textarea name="html"></textarea>
      <label>Comment (optional)</label><input name="comment" placeholder="what changed">
      <div style="margin-top:14px"><button type="submit">Publish new version</button></div>
    </form>
  </div>

  <div class="card"><h2>Versions</h2>
    <table><thead><tr><th>Version</th><th></th><th>Size</th><th>Comment</th><th>Created</th></tr></thead><tbody>${verRows}</tbody></table>
  </div>

  <div class="card"><h2>Danger zone</h2>
    <form method="post" action="/app/doc/${doc.id}/delete" onsubmit="return confirm('Delete this doc and all versions? This cannot be undone.')">
      <button class="danger" type="submit">Delete doc</button>
    </form>
  </div>`;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
