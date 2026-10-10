import { escapeHtml } from "./lib";
import { Doc, Version, Visibility } from "./docs";
import type { TeamSummary, LegacyMigrationRow } from "./teams";

const STYLE = `
:root{
  --navy:#0a1929;--panel:#0c1e30;--panel2:#07121e;--line:rgba(54,214,255,.18);
  --line-strong:rgba(54,214,255,.42);--fg:#cfe8ff;--mut:#6f93b0;
  --acc:#36d6ff;--acc-dim:#1c6f8c;--amber:#ffc24b;--ok:#7fe3a0;--bad:#ff6b7d;
  --grid:rgba(54,214,255,.06);
  --disp:"Archivo",ui-sans-serif,system-ui,sans-serif;
  --mono:"Chivo Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;color:var(--fg);font:14px/1.6 var(--mono);
  background:
    linear-gradient(var(--grid) 1px,transparent 1px) 0 0/26px 26px,
    linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/26px 26px,
    linear-gradient(var(--grid) 1px,transparent 1px) 0 0/130px 130px,
    linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/130px 130px,
    radial-gradient(circle at 80% -5%,rgba(54,214,255,.10),transparent 45%),
    var(--navy);
  background-attachment:fixed;
}
::selection{background:var(--acc);color:var(--navy)}
a{color:var(--acc);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
.muted{color:var(--mut)}
.wrap{max-width:980px;margin:0 auto;padding:24px 24px 110px}

header.top{
  position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;
  padding:14px 24px;border-bottom:1px solid var(--line-strong);
  background:rgba(10,25,41,.82);backdrop-filter:blur(8px);
}
header.top .brand{font-family:var(--disp);font-weight:900;font-size:18px;letter-spacing:1px;text-transform:uppercase;color:var(--fg);line-height:1}
header.top .brand b{color:var(--acc)}
header.top .brand small{display:block;font-family:var(--mono);font-weight:400;font-size:10px;color:var(--mut);letter-spacing:2px;margin-top:1px}

button,.btn{
  display:inline-flex;align-items:center;gap:7px;font:inherit;font-weight:500;cursor:pointer;
  background:var(--acc);color:var(--navy);border:1px solid var(--acc);border-radius:0;
  padding:8px 16px;text-transform:uppercase;letter-spacing:1px;font-size:12px;transition:.15s;
}
button:hover,.btn:hover{background:transparent;color:var(--acc);text-decoration:none;box-shadow:4px 4px 0 var(--acc-dim)}
button.ghost,.btn.ghost{background:transparent;color:var(--acc);border:1px solid var(--line-strong)}
button.ghost:hover,.btn.ghost:hover{border-color:var(--acc);box-shadow:4px 4px 0 var(--acc-dim)}
button.danger,.btn.danger{background:transparent;color:var(--bad);border:1px solid rgba(255,107,125,.4)}
button.danger:hover,.btn.danger:hover{background:transparent;color:var(--bad);border-color:var(--bad);box-shadow:4px 4px 0 rgba(255,107,125,.3)}

.card{
  position:relative;background:linear-gradient(180deg,rgba(12,30,48,.7),rgba(10,25,41,.5));
  border:1px solid var(--line-strong);border-radius:0;padding:24px;margin:22px 0;
}
.card::before,.card::after{content:"";position:absolute;width:11px;height:11px;border:1px solid var(--line-strong)}
.card::before{top:-1px;left:-1px;border-right:0;border-bottom:0}
.card::after{bottom:-1px;right:-1px;border-left:0;border-top:0}
.card h2{
  font-family:var(--disp);font-weight:800;font-size:17px;margin:0 0 16px;
  text-transform:uppercase;letter-spacing:.5px;color:var(--fg);
  display:flex;align-items:center;gap:10px;
}
.card h2::before{content:"";width:14px;height:2px;background:var(--acc);box-shadow:0 0 10px var(--acc)}

label{display:block;font-size:11px;color:var(--mut);margin:15px 0 5px;letter-spacing:1.5px;text-transform:uppercase}
input,textarea,select{width:100%;background:rgba(7,18,30,.7);border:1px solid var(--line);border-radius:0;color:var(--fg);padding:10px 12px;font:inherit}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
textarea{min-height:200px;font-size:13px}
input[type=file]{padding:8px;color:var(--mut)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.grid{display:grid;gap:16px}

table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);font-size:13px}
th{color:var(--acc-dim);font-weight:500;font-size:10px;letter-spacing:2px;text-transform:uppercase}
tbody tr{transition:.12s}tbody tr:hover td{background:rgba(54,214,255,.05)}

code,kbd{font-family:var(--mono);background:rgba(7,18,30,.8);border:1px solid var(--line);border-radius:0;padding:2px 7px;font-size:12px;color:var(--amber)}
pre{background:rgba(7,18,30,.85);border:1px solid var(--line);border-left:2px solid var(--acc);border-radius:0;padding:18px;overflow:auto;font-size:13px;color:var(--fg)}
.flash{padding:12px 16px;border-radius:0;margin:16px 0;font-size:13px;border:1px solid;letter-spacing:.5px}
.flash.err{background:rgba(255,107,125,.07);border-color:rgba(255,107,125,.5);color:#ffb0ba}
.flash.ok{background:rgba(127,227,160,.07);border-color:rgba(127,227,160,.5);color:#a8f0c0}
.pill{display:inline-block;font-size:11px;padding:2px 9px;border-radius:0;background:rgba(7,18,30,.8);border:1px solid var(--line);color:var(--mut);letter-spacing:1px}
.keybox{background:rgba(7,18,30,.9);border:1px dashed var(--amber);border-radius:0;padding:14px;word-break:break-all;color:var(--amber);font-family:var(--mono)}

.hero{padding:72px 0 36px;position:relative}
.hero .eyebrow{font-size:11px;letter-spacing:5px;text-transform:uppercase;color:var(--acc);margin-bottom:22px}
.hero .eyebrow::before{content:"◢  "}
.hero h1{font-family:var(--disp);font-weight:900;font-size:64px;line-height:.96;letter-spacing:-2px;margin:0 0 22px;text-transform:uppercase;color:var(--fg)}
.hero h1 span{color:var(--acc);position:relative}
.hero h1 span::after{content:"";position:absolute;left:0;right:0;bottom:6px;height:8px;background:rgba(54,214,255,.18)}
.hero p.lede{font-size:16px;max-width:600px;color:var(--mut);margin:0 0 30px}
.hero p.lede b{color:var(--fg)}
@media (max-width:640px){
  .wrap{padding:20px 16px 64px}
  header.top{padding:14px 16px;flex-wrap:wrap;gap:10px}
  header.top .brand{font-size:16px}
  header.top nav.row{gap:8px}
  .btn,button{padding:10px 14px}
  .hero{padding:32px 0 16px}
  .hero h1{font-size:32px;letter-spacing:-1px}
  .hero p.lede{font-size:15px}
  .hero .row{gap:8px}
  .hero .row .btn{flex:1 1 auto;text-align:center}
  .card{padding:16px}
  .grid{grid-template-columns:1fr !important}
  pre{font-size:12px;padding:12px}
  table{display:block;overflow-x:auto;white-space:nowrap}
}
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Chivo+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">`;

export function layout(title: string, body: string, user?: { email: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · vibedeployer</title>${FONTS}<style>${STYLE}</style></head>
<body>
<header class="top">
  <a class="brand" href="/" style="text-decoration:none">VIBE<b>DEPLOYER</b><small>HTML HOSTING SYSTEM · REV 1.0</small></a>
  <nav class="row">
    ${
      user
        ? `<span class="muted">${escapeHtml(user.email)}</span><a class="btn ghost" href="/app">Dashboard</a><a class="btn ghost" href="/logout">Log out</a>`
        : `<a class="btn" href="/login">Log in</a>`
    }
  </nav>
</header>
<div class="wrap">${body}</div>
</body></html>`;
}

export function flash(msg: string | undefined, kind: "err" | "ok" = "err"): string {
  return msg ? `<div class="flash ${kind}">${escapeHtml(msg)}</div>` : "";
}

export function landingPage(loggedIn = false): string {
  const cta = loggedIn
    ? `<div class="row"><a class="btn" href="/app">Go to dashboard →</a></div>`
    : `<div class="row"><a class="btn" href="/auth/google">Sign in with Google →</a></div>`;
  return `<div class="hero">
    <div class="eyebrow">Edge-hosted · versioned · agent-ready</div>
    <h1>Host &amp; version<br>HTML, <span>instantly.</span></h1>
    <p class="lede">Upload an HTML file — get a unique URL. Every upload is a new version with full history and instant rollback. Docs are <b>private by default</b>: your team gets in with Google sign-in, everyone else needs the doc password. Public links are opt-in. Engineered for humans <b>and</b> agents: log in via the web, or push with an API key.</p>
    ${cta}
  </div>
  <div class="card"><h2>For agents (API)</h2>
  <pre>curl -X POST https://vibedeployer.sebous.workers.dev/api/docs \\
  -H "Authorization: Bearer vd_your_key" \\
  -H "Content-Type: text/html" \\
  --data-binary @report.html
# → { "url": "https://vibedeployer.sebous.workers.dev/d/x7k2p9q", "version": 1 }</pre></div>

  <div class="card"><h2>Agent skill</h2>
  <p class="muted" style="margin:0 0 14px">Teach your agent to publish HTML in one line. Install the <a href="https://github.com/sebous/vibedeployer/tree/main/skills/vibedeployer" target="_blank" rel="noopener">vibedeployer skill</a>, then just ask your agent to "host this as a page."</p>
  <pre>npx skills install sebous/vibedeployer/skills/vibedeployer</pre></div>`;
}

export function loginPage(next: string, err?: string): string {
  return `<div class="card" style="max-width:440px;margin:60px auto">
    <h2>Log in</h2>
    ${flash(err)}
    <p class="muted" style="margin:0 0 18px">Sign in with your Google account. If your company is set up as a team, you join it automatically.</p>
    <a class="btn" href="/auth/google?next=${encodeURIComponent(next)}">Sign in with Google →</a>
  </div>`;
}

// Shown when a visitor can't view a doc yet. Team docs offer Google sign-in;
// docs with a password offer the unlock form.
export function unlockPage(opts: {
  slug: string;
  redirect: string;
  teamName?: string;
  hasPassword: boolean;
  signedInAs?: string;
  err?: string;
}): string {
  const { slug, redirect, teamName, hasPassword, signedInAs, err } = opts;
  const teamBlock = teamName
    ? `<p class="muted" style="margin:0 0 14px">Members of <b style="color:var(--fg)">${escapeHtml(teamName)}</b> can view this doc after signing in.</p>
       ${
         signedInAs
           ? `<p class="flash err">Signed in as ${escapeHtml(signedInAs)}, which is not in ${escapeHtml(teamName)}. <a href="/logout">Switch account</a></p>`
           : `<a class="btn" href="/auth/google?next=${encodeURIComponent(redirect)}">Sign in with Google →</a>`
       }`
    : "";
  const passwordBlock = hasPassword
    ? `${teamName ? `<p class="muted" style="margin:22px 0 4px">Not on the team? Enter the password you were given.</p>` : `<p class="muted" style="margin:0 0 4px">This page is password-protected. Enter the password to view it.</p>`}
    ${flash(err)}
    <form method="post" action="/d/${escapeHtml(slug)}/unlock">
      <input type="hidden" name="redirect" value="${escapeHtml(redirect)}">
      <label>Password</label><input name="password" type="password" required${teamName ? "" : " autofocus"}>
      <div style="margin-top:20px"><button type="submit">Unlock →</button></div>
    </form>`
    : "";
  return `<div class="card" style="max-width:440px;margin:60px auto">
    <h2>Protected document</h2>
    ${teamBlock}${passwordBlock}
  </div>`;
}

const VISIBILITY_LABEL: Record<Visibility, string> = {
  team: "team + password",
  password: "password",
  public: "public",
};

function visibilityPill(d: Doc): string {
  const color = d.visibility === "public" ? "var(--mut)" : "var(--amber)";
  const icon = d.visibility === "public" ? "🌐" : "🔒";
  return ` <span class="pill" style="color:${color}">${icon} ${VISIBILITY_LABEL[d.visibility]}</span>`;
}

function newPasswordBox(pw: string): string {
  return `<div class="card"><h2>Doc password — copy it now</h2>
    <p class="muted">Share this with people outside your team. This is the only time it is shown; you can set a new one below.</p>
    <div class="keybox" id="newkey" data-key="${escapeHtml(pw)}">${escapeHtml(pw)}</div>
    <div style="margin-top:14px"><button type="button" class="ghost" onclick="copyKey(this)">Copy to clipboard</button></div>
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
  teamName?: string;
  isAdmin?: boolean;
  flashMsg?: string;
  flashKind?: "ok" | "err";
}): string {
  const { origin, docs, keys, teamName } = opts;
  const docRows = docs.length
    ? docs
        .map((d) => {
          const url = `/d/${d.custom_slug ?? d.slug}`;
          return `<tr>
        <td><a href="/app/doc/${d.id}">${escapeHtml(d.title)}</a>${visibilityPill(d)}<br><a class="muted" href="${url}" target="_blank">${escapeHtml(origin + url)}</a></td>
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

  const teamLine = teamName
    ? `Team: <b>${escapeHtml(teamName)}</b>. New docs default to <b>team + password</b>: your team signs in with Google, everyone else needs the doc password.`
    : `You are not in a team. New docs default to <b>password</b>. Ask an admin to add your company's Google Workspace domain.`;

  return `
  ${opts.flashMsg ? flash(opts.flashMsg, opts.flashKind ?? "ok") : ""}
  <p class="muted">${teamLine}${opts.isAdmin ? ` · <a href="/admin">Admin</a>` : ""}</p>
  ${
    opts.newKey
      ? `<div class="card"><h2>New API key — copy it now</h2><p class="muted">This is the only time the full key is shown.</p>
          <div class="keybox" id="newkey" data-key="${escapeHtml(opts.newKey)}">${escapeHtml(opts.newKey)}</div>
          <div style="margin-top:14px"><button type="button" class="ghost" onclick="copyKey(this)">Copy to clipboard</button></div>
        </div>`
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
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label>Access</label>${visibilitySelect(teamName ? "team" : "password", !!teamName)}</div>
        <div><label>Password (optional)</label><input name="password" type="password" autocomplete="new-password" placeholder="blank = generate one"></div>
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
  </div>
  ${COPY_SCRIPT}`;
}

const COPY_SCRIPT = `<script>
  function copyKey(btn){
    var el=document.getElementById('newkey'); if(!el) return;
    var val=el.getAttribute('data-key')||el.textContent;
    var done=function(){var t=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=t;},1500);};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(val).then(done,done);}
    else{var ta=document.createElement('textarea');ta.value=val;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);done();}
  }
  </script>`;

export function docDetail(opts: {
  origin: string;
  doc: Doc;
  versions: Version[];
  teamName?: string;
  newPassword?: string;
  flashMsg?: string;
  flashKind?: "ok" | "err";
}): string {
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

  const hasPassword = !!doc.password_hash;
  const accessText: Record<Visibility, string> = {
    team: `Members of your team can view it after Google sign-in. ${hasPassword ? "Everyone else needs the password." : "<b>No password set</b>, so nobody outside the team can view it."}`,
    password: "Everyone needs the password, including your team.",
    public: "<b>Anyone with the link</b> can view it.",
  };
  const passwordForm =
    doc.visibility === "public"
      ? ""
      : `<form method="post" action="/app/doc/${doc.id}/password" class="row" style="margin-top:14px">
          <input name="password" type="password" autocomplete="new-password" placeholder="${hasPassword ? "new password" : "set a password"}" style="max-width:280px">
          <button type="submit">${hasPassword ? "Change password" : "Set password"}</button>
        </form>
        ${
          doc.visibility === "team" && hasPassword
            ? `<form method="post" action="/app/doc/${doc.id}/password/remove" style="margin-top:14px" onsubmit="return confirm('Remove the password? Only team members will be able to view this doc.')">
                <button class="danger" type="submit">Remove password (team only)</button>
              </form>`
            : ""
        }`;
  const accessCard = `<div class="card"><h2>Access</h2>
    <p class="muted" style="margin:0 0 14px">${accessText[doc.visibility]}</p>
    <form method="post" action="/app/doc/${doc.id}/visibility" class="row"${doc.visibility === "public" ? "" : ` onsubmit="return this.visibility.value!=='public'||confirm('Make this doc public? Anyone with the link will see it.')"`}>
      <div style="max-width:280px;flex:1">${visibilitySelect(doc.visibility, !!opts.teamName)}</div>
      <button type="submit">Update access</button>
    </form>
    ${passwordForm}
  </div>`;

  return `
  <p><a href="/app">← Dashboard</a></p>
  ${opts.flashMsg ? flash(opts.flashMsg, opts.flashKind ?? "ok") : ""}
  <div class="card">
    <h2>${escapeHtml(doc.title)}</h2>
    <p>Live URL: <a href="${liveUrl}" target="_blank">${escapeHtml(origin + liveUrl)}</a> <span class="pill">always latest</span>${visibilityPill(doc)}</p>
    <p class="muted">Random slug: <code>${escapeHtml(doc.slug)}</code></p>
    <form method="post" action="/app/doc/${doc.id}/slug" class="row">
      <input name="custom_slug" value="${escapeHtml(doc.custom_slug ?? "")}" placeholder="custom-slug" style="max-width:280px">
      <button type="submit">Set custom slug</button>
    </form>
  </div>

  ${opts.newPassword ? newPasswordBox(opts.newPassword) : ""}
  ${accessCard}

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
  </div>
  ${COPY_SCRIPT}`;
}

function visibilitySelect(selected: Visibility, hasTeam: boolean): string {
  const opt = (v: Visibility, label: string, disabled = false) =>
    `<option value="${v}"${v === selected ? " selected" : ""}${disabled ? " disabled" : ""}>${label}</option>`;
  return `<select name="visibility">
    ${opt("team", hasTeam ? "Team + password for others" : "Team (you are not in a team)", !hasTeam)}
    ${opt("password", "Password for everyone")}
    ${opt("public", "Public — anyone with the link")}
  </select>`;
}

// --- Admin ---------------------------------------------------------------

const METHOD_LABEL: Record<string, string> = { google: "Google Workspace" };

function teamForm(action: string, team?: TeamSummary): string {
  return `<form method="post" action="${action}">
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div><label>Name</label><input name="name" required value="${escapeHtml(team?.name ?? "")}" placeholder="STRV"></div>
      <div><label>Sign-in method</label><select name="sign_in_method"><option value="google" selected>Google Workspace</option></select></div>
    </div>
    <label>Workspace domains (comma-separated)</label>
    <input name="domains" required value="${escapeHtml(team?.domains.join(", ") ?? "")}" placeholder="strv.com">
    <p class="muted" style="margin:8px 0 0">A Google account joins this team when its verified Workspace domain is listed. Personal Gmail accounts never match.</p>
    <div style="margin-top:16px"><button type="submit">${team ? "Save team" : "Create team"}</button></div>
  </form>`;
}

export function adminPage(opts: { teams: TeamSummary[]; legacyCount: number; flashMsg?: string; flashKind?: "ok" | "err" }): string {
  const rows = opts.teams.length
    ? opts.teams
        .map(
          (t) => `<tr>
        <td><a href="/admin/teams/${t.id}">${escapeHtml(t.name)}</a></td>
        <td>${METHOD_LABEL[t.sign_in_method] ?? escapeHtml(t.sign_in_method)}</td>
        <td>${t.domains.map((d) => `<code>${escapeHtml(d)}</code>`).join(" ")}</td>
        <td>${t.members}</td>
        <td>${t.docs}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="muted">No teams yet.</td></tr>`;
  const legacy = opts.legacyCount
    ? `<div class="card"><h2>Legacy public docs</h2>
        <p class="muted" style="margin:0 0 14px"><b style="color:var(--amber)">${opts.legacyCount}</b> docs are still public from before access modes existed. Create teams first, then migrate. Each doc moves to its owner's team (by email domain) or to password-only, and gets a new password. <b>Passwords are shown once on the next page.</b></p>
        <form method="post" action="/admin/migrate-legacy" onsubmit="return confirm('Protect all ${opts.legacyCount} legacy public docs now?')">
          <button type="submit">Migrate legacy docs</button>
        </form>
      </div>`
    : "";
  return `
  ${opts.flashMsg ? flash(opts.flashMsg, opts.flashKind ?? "ok") : ""}
  <div class="card"><h2>Teams</h2>
    <table><thead><tr><th>Name</th><th>Sign-in</th><th>Domains</th><th>Members</th><th>Docs</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="card"><h2>New team</h2>${teamForm("/admin/teams")}</div>
  ${legacy}`;
}

export function adminTeamPage(opts: {
  team: TeamSummary;
  members: { email: string; created_at: number }[];
  flashMsg?: string;
  flashKind?: "ok" | "err";
}): string {
  const { team, members } = opts;
  const rows = members.length
    ? members.map((m) => `<tr><td>${escapeHtml(m.email)}</td><td class="muted">${fmtDate(m.created_at)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="muted">Nobody yet. Members join on their next Google sign-in.</td></tr>`;
  return `
  <p><a href="/admin">← Admin</a></p>
  ${opts.flashMsg ? flash(opts.flashMsg, opts.flashKind ?? "ok") : ""}
  <div class="card"><h2>${escapeHtml(team.name)}</h2>${teamForm(`/admin/teams/${team.id}`, team)}</div>
  <div class="card"><h2>Members (${team.members})</h2>
    <table><thead><tr><th>Email</th><th>Joined vibedeployer</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

export function adminMigrationResult(origin: string, rows: LegacyMigrationRow[]): string {
  const body = rows.length
    ? rows
        .map(
          (r) => `<tr>
        <td><a href="/d/${escapeHtml(r.slug)}" target="_blank">${escapeHtml(r.title)}</a><br><span class="muted">${escapeHtml(origin)}/d/${escapeHtml(r.slug)}</span></td>
        <td>${escapeHtml(r.owner_email)}</td>
        <td>${r.visibility === "team" ? `team: ${escapeHtml(r.team_name ?? "")}` : "password"}</td>
        <td><code>${escapeHtml(r.password)}</code></td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">Nothing to migrate.</td></tr>`;
  return `
  <p><a href="/admin">← Admin</a></p>
  <div class="card"><h2>Migrated ${rows.length} docs</h2>
    <p class="muted"><b style="color:var(--amber)">Copy these passwords now.</b> They are not shown again. Owners can set new ones from their dashboard.</p>
    <table><thead><tr><th>Doc</th><th>Owner</th><th>Access</th><th>Password</th></tr></thead><tbody>${body}</tbody></table>
  </div>`;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
