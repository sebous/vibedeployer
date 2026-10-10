import { Hono } from "hono";
import { AppVars, randomId, now, generateApiKey, sha256Hex } from "./lib";
import { destroySession, requireUser, isAdmin } from "./auth";
import { getTeam } from "./teams";
import { safeNext } from "./google";
import {
  createDoc,
  addVersion,
  getDocById,
  listDocsByOwner,
  listVersions,
  updateCustomSlug,
  setDocPassword,
  setDocVisibility,
  deleteDoc,
  ApiError,
} from "./docs";
import { layout, landingPage, loginPage, dashboard, docDetail } from "./ui";

export const pages = new Hono<AppVars>();

// --- Landing -------------------------------------------------------------
pages.get("/", (c) => {
  const user = c.get("user");
  return c.html(layout("Host & version HTML", landingPage(!!user), user ?? undefined));
});

// --- Auth (Google only; see google.ts) ----------------------------------
pages.get("/login", (c) => {
  if (c.get("user")) return c.redirect(safeNext(c.req.query("next")));
  return c.html(layout("Log in", loginPage(safeNext(c.req.query("next")), c.req.query("error"))));
});
pages.get("/signup", (c) => c.redirect("/login"));

pages.get("/logout", async (c) => {
  await destroySession(c);
  return c.redirect("/");
});

// --- Dashboard (auth required) ------------------------------------------
pages.use("/app", requireUser);
pages.use("/app/*", requireUser);

pages.get("/app", async (c) => {
  const user = c.get("user")!;
  const docs = await listDocsByOwner(c.env, user.id);
  const [keys, team] = await Promise.all([keyRows(c, user.id), user.team_id ? getTeam(c.env, user.team_id) : null]);
  const url = new URL(c.req.url);
  return c.html(
    layout(
      "Dashboard",
      dashboard({
        origin: url.origin,
        docs,
        keys,
        newKey: c.req.query("key"),
        teamName: team?.name,
        isAdmin: isAdmin(c),
        flashMsg: c.req.query("msg"),
        flashKind: (c.req.query("kind") as "ok" | "err") ?? "ok",
      }),
      user,
    ),
  );
});

async function readHtmlFromForm(c: any): Promise<string> {
  const body = await c.req.parseBody();
  const file = body.file;
  if (file && typeof file === "object" && "text" in file && file.size > 0) {
    return await (file as File).text();
  }
  return String(body.html ?? "").trim();
}

pages.post("/app/docs", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.parseBody();
  const file = body.file as File | undefined;
  const html = file && file.size > 0 ? await file.text() : String(body.html ?? "").trim();
  if (!html) return c.redirect("/app?msg=" + enc("Provide an HTML file or paste HTML.") + "&kind=err");
  try {
    const { doc, generatedPassword } = await createDoc(c.env, {
      owner: user,
      title: String(body.title ?? "") || undefined,
      html,
      customSlug: String(body.custom_slug ?? "").trim() || undefined,
      password: String(body.password ?? "").trim() || undefined,
      visibility: String(body.visibility ?? "").trim() || undefined,
    });
    return c.redirect(`/app/doc/${doc.id}` + passwordQuery(generatedPassword));
  } catch (e) {
    return c.redirect("/app?msg=" + enc(errMsg(e)) + "&kind=err");
  }
});

pages.get("/app/doc/:id", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  const [versions, team] = await Promise.all([
    listVersions(c.env, doc.id),
    user.team_id ? getTeam(c.env, user.team_id) : null,
  ]);
  const url = new URL(c.req.url);
  return c.html(
    layout(
      doc.title,
      docDetail({
        origin: url.origin,
        doc,
        versions,
        teamName: team?.name,
        newPassword: c.req.query("pw"),
        flashMsg: c.req.query("msg"),
        flashKind: (c.req.query("kind") as "ok" | "err") ?? "ok",
      }),
      user,
    ),
  );
});

pages.post("/app/doc/:id/versions", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  const body = await c.req.parseBody();
  const file = body.file as File | undefined;
  const html = file && file.size > 0 ? await file.text() : String(body.html ?? "").trim();
  if (!html) return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Nothing to upload.") + "&kind=err");
  try {
    await addVersion(c.env, doc, { html, comment: String(body.comment ?? "") || undefined });
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc("New version published."));
  } catch (e) {
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc(errMsg(e)) + "&kind=err");
  }
});

pages.post("/app/doc/:id/slug", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  const body = await c.req.parseBody();
  const slug = String(body.custom_slug ?? "").trim();
  try {
    await updateCustomSlug(c.env, doc, slug);
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Custom slug updated."));
  } catch (e) {
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc(errMsg(e)) + "&kind=err");
  }
});

pages.post("/app/doc/:id/password", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  if (!password.trim())
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Enter a password.") + "&kind=err");
  await setDocPassword(c.env, doc, password);
  return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Password protection enabled."));
});

pages.post("/app/doc/:id/password/remove", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  try {
    await setDocPassword(c.env, doc, null);
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Password removed. Only team members can view this doc."));
  } catch (e) {
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc(errMsg(e)) + "&kind=err");
  }
});

pages.post("/app/doc/:id/visibility", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  const body = await c.req.parseBody();
  try {
    const { generatedPassword } = await setDocVisibility(c.env, doc, user, String(body.visibility ?? ""));
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Access updated.") + passwordQuery(generatedPassword, "&"));
  } catch (e) {
    return c.redirect(`/app/doc/${doc.id}?msg=` + enc(errMsg(e)) + "&kind=err");
  }
});

pages.post("/app/doc/:id/delete", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  await deleteDoc(c.env, doc);
  return c.redirect("/app?msg=" + enc("Doc deleted."));
});

// --- API keys ------------------------------------------------------------
pages.post("/app/keys", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim().slice(0, 80) || "key";
  const key = generateApiKey();
  await c.env.DB.prepare(
    "INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(randomId(), user.id, name, key.slice(0, 11), await sha256Hex(key), now())
    .run();
  return c.redirect("/app?key=" + enc(key) + "&msg=" + enc("API key created."));
});

pages.post("/app/keys/:id/revoke", async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .run();
  return c.redirect("/app?msg=" + enc("Key revoked."));
});

// --- helpers -------------------------------------------------------------
async function keyRows(c: any, userId: string) {
  const res = await c.env.DB.prepare(
    "SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC",
  )
    .bind(userId)
    .all();
  return res.results ?? [];
}

const enc = encodeURIComponent;
// Generated passwords ride the redirect once so the owner can copy them,
// same as new API keys.
const passwordQuery = (pw: string | undefined, sep = "?") => (pw ? `${sep}pw=${enc(pw)}` : "");
function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong.";
}
