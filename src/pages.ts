import { Hono } from "hono";
import { Env, randomId, now, hashPassword, verifyPassword, generateApiKey, sha256Hex } from "./lib";
import { createSession, destroySession, requireUser } from "./auth";
import {
  createDoc,
  addVersion,
  getDocById,
  listDocsByOwner,
  listVersions,
  updateCustomSlug,
  setDocPassword,
  deleteDoc,
  ApiError,
} from "./docs";
import { layout, landingPage, authPage, dashboard, docDetail } from "./ui";

type Vars = { Bindings: Env; Variables: { user?: { id: string; email: string } } };
export const pages = new Hono<Vars>();

// --- Landing -------------------------------------------------------------
pages.get("/", (c) => {
  const user = c.get("user");
  return c.html(layout("Host & version HTML", landingPage(!!user), user ?? undefined));
});

// --- Auth ----------------------------------------------------------------
pages.get("/signup", (c) => c.html(layout("Sign up", authPage("signup"))));
pages.get("/login", (c) => c.html(layout("Log in", authPage("login"))));

pages.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || password.length < 8)
    return c.html(layout("Sign up", authPage("signup", "Enter a valid email and 8+ char password.")));
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return c.html(layout("Sign up", authPage("signup", "That email is already registered.")));
  const id = randomId();
  await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, email, await hashPassword(password), now())
    .run();
  await createSession(c, id);
  return c.redirect("/app");
});

pages.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const user = await c.env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return c.html(layout("Log in", authPage("login", "Invalid email or password.")));
  await createSession(c, user.id);
  return c.redirect("/app");
});

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
  const keys = await keyRows(c, user.id);
  const url = new URL(c.req.url);
  return c.html(
    layout(
      "Dashboard",
      dashboard({
        origin: url.origin,
        docs,
        keys,
        newKey: c.req.query("key"),
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
    const { doc } = await createDoc(c.env, {
      ownerId: user.id,
      title: String(body.title ?? "") || undefined,
      html,
      customSlug: String(body.custom_slug ?? "").trim() || undefined,
      password: String(body.password ?? "").trim() || undefined,
    });
    return c.redirect(`/app/doc/${doc.id}`);
  } catch (e) {
    return c.redirect("/app?msg=" + enc(errMsg(e)) + "&kind=err");
  }
});

pages.get("/app/doc/:id", async (c) => {
  const user = c.get("user")!;
  const doc = await getDocById(c.env, c.req.param("id"));
  if (!doc || doc.owner_id !== user.id) return c.notFound();
  const versions = await listVersions(c.env, doc.id);
  const url = new URL(c.req.url);
  return c.html(
    layout(
      doc.title,
      docDetail({
        origin: url.origin,
        doc,
        versions,
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
  await setDocPassword(c.env, doc, null);
  return c.redirect(`/app/doc/${doc.id}?msg=` + enc("Password protection removed."));
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
function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong.";
}
