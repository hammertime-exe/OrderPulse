import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  CalendarSlot,
  GoogleLink,
  InboxMessage,
  ProposalPayload,
  State,
} from "../shared/types.ts";
import { iso } from "../shared/time.ts";
import { now, readState, updateState } from "./store.ts";

// Google sign-in (OWNER_EMAILS only) and the one connected seller account: Gmail orders in, replies out, Calendar both ways.
// Off unless GOOGLE_CLIENT_ID is set, so the local demo and tests run without Google.
export type Reply = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  cookies?: string[];
};
export type Req = { cookie?: string; query?: URLSearchParams; origin?: string };

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3";
const SCOPES = {
  login: "openid email",
  connect:
    "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.events.readonly",
};

export const authOn = () => !!process.env.GOOGLE_CLIENT_ID;
const secret = () => {
  const s = process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return s;
};
const owners = () =>
  (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// ---- session cookie: base64url("email|expiry").hmac, keyed with the client secret ----
const mac = (v: string) =>
  createHmac("sha256", secret()).update(v).digest("base64url");
const cookieOf = (cookie: string | undefined, name: string) =>
  cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];

export const session = (email: string, ms = 7 * 864e5) => {
  const v = `${email}|${Date.now() + ms}`;
  return `${Buffer.from(v).toString("base64url")}.${mac(v)}`;
};

/** Signed-in email (or "agent"), or null. Someone removed from OWNER_EMAILS loses access at once. */
export function sessionEmail(cookie?: string): string | null {
  const [b, sig] = (cookieOf(cookie, "op_session") ?? "").split(".");
  if (!b || !sig) return null;
  const v = Buffer.from(b, "base64url").toString();
  const good = Buffer.from(mac(v)),
    got = Buffer.from(sig);
  if (got.length !== good.length || !timingSafeEqual(got, good)) return null;
  const cut = v.lastIndexOf("|"),
    email = v.slice(0, cut);
  if (!(Number(v.slice(cut + 1)) > Date.now())) return null;
  return email === "agent" || owners().includes(email) ? email : null;
}

const setCookie = (name: string, value: string, maxAge: number, origin = "") =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;

const page = (status: number, text: string): Reply => ({
  status,
  headers: { "content-type": "text/html; charset=utf-8" },
  body: `<!doctype html><meta charset="utf-8"><title>OrderPulse</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto"><h1>OrderPulse</h1><p>${text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</p><p><a href="/">Back to OrderPulse</a></p>`,
});
const redirect = (location: string, cookies: string[] = []): Reply => ({
  status: 302,
  headers: { location },
  body: "",
  cookies,
});

// ---- OAuth: /api/auth/login and /api/auth/connect both return to /api/gmail/callback ----
export function authStart(kind: "login" | "connect", req: Req): Reply {
  if (kind === "connect" && !sessionEmail(req.cookie))
    return page(401, "Sign in before connecting the seller's Google account.");
  const state = `${kind}.${randomBytes(16).toString("hex")}`;
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${req.origin}/api/gmail/callback`,
    response_type: "code",
    scope: SCOPES[kind],
    state,
    ...(kind === "connect"
      ? { access_type: "offline", prompt: "consent" } // consent every time so Google always returns a refresh token
      : { prompt: "select_account" }),
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, [
    setCookie("op_oauth", state, 600, req.origin),
  ]);
}

async function tokenCall(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: secret(),
      ...params,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? `token ${r.status}`);
  return j as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    id_token?: string;
    scope?: string;
  };
}

export async function authCallback(req: Req): Promise<Reply> {
  const q = req.query ?? new URLSearchParams();
  const state = q.get("state") ?? "";
  if (!state || state !== cookieOf(req.cookie, "op_oauth"))
    return page(400, "This sign-in link expired. Start again from OrderPulse.");
  if (q.get("error"))
    return page(400, `Google sign-in was cancelled (${q.get("error")}).`);
  const connect = state.startsWith("connect.");
  if (connect && !sessionEmail(req.cookie))
    return page(401, "Sign in before connecting the seller's Google account.");
  try {
    const tok = await tokenCall({
      code: q.get("code") ?? "",
      grant_type: "authorization_code",
      redirect_uri: `${req.origin}/api/gmail/callback`,
    });
    // The id_token came straight from Google's token endpoint over TLS, so its claims can be read without re-verifying the signature.
    const claims = JSON.parse(
      Buffer.from(tok.id_token?.split(".")[1] ?? "", "base64url").toString() || "{}",
    );
    const email = String(claims.email ?? "").toLowerCase();
    if (!claims.email_verified || !owners().includes(email))
      return page(403, `${email || "This account"} is not allowed to use this OrderPulse workspace.`);
    if (connect) {
      const missing = SCOPES.connect.split(" ").filter((s) => s.startsWith("https") && !tok.scope?.split(" ").includes(s));
      if (missing.length)
        return page(400, "Some permissions were unticked on Google's screen. Connect again and allow Gmail and Calendar access.");
      if (!tok.refresh_token) return page(400, "Google did not return offline access. Connect again.");
      await link(email, tok.refresh_token, tok.access_token);
    }
    return redirect(connect ? "/#Business%20setup" : "/", [
      setCookie("op_session", session(email), 7 * 86400, req.origin),
      setCookie("op_oauth", "", 0, req.origin),
    ]);
  } catch (e) {
    return page(502, `Google sign-in failed: ${(e as Error).message}`);
  }
}

export const logout = (req: Req) =>
  ({ status: 200, body: { ok: true }, cookies: [setCookie("op_session", "", 0, req.origin)] }) satisfies Reply;

async function link(email: string, refreshToken: string, token: string) {
  const { labels } = await gapi(token, `${GMAIL}/labels`);
  const label = (name: string) =>
    labels.find((l: { name: string }) => l.name.toLowerCase() === name.toLowerCase())?.id;
  const ordersLabel = label("Orders"),
    processedLabel = label("Orders/Processed");
  if (!ordersLabel || !processedLabel)
    throw new Error('create the Gmail labels "Orders" and "Orders/Processed" first');
  // calendar.app.created cannot list calendars, so keep the one made on the first connect.
  const old = (await readState()).google;
  const calendarId =
    old?.calendarId ??
    (await gapi(token, `${CAL}/calendars`, "POST", { summary: "OrderPulse", timeZone: "Asia/Kolkata" })).id;
  cached = { refreshToken, token, exp: Date.now() + 3000e3 };
  await updateState((s) => {
    const same = s.google?.email === email;
    s.google = {
      email,
      refreshToken,
      ordersLabel,
      processedLabel,
      calendarId,
      drafts: same ? s.google!.drafts : {},
      sent: same ? s.google!.sent : [],
      processed: same ? s.google!.processed : [],
    };
    s.audit.unshift({ at: now(), actor: "seller", action: "connected Google", detail: `Gmail and Calendar of ${email}` });
  });
}

/** What the browser may see: no tokens, plus who is signed in. */
export const publicState = (s: State, user: string | null) => {
  const { google, ...rest } = s;
  return { ...rest, auth: authOn(), user, google: google && { email: google.email, error: google.error } };
};

// ---- Google REST calls ----
let cached: { refreshToken: string; token: string; exp: number } | undefined;
async function accessToken(g: GoogleLink) {
  if (cached?.refreshToken === g.refreshToken && cached.exp > Date.now() + 60e3) return cached.token;
  try {
    const t = await tokenCall({ refresh_token: g.refreshToken, grant_type: "refresh_token" });
    cached = { refreshToken: g.refreshToken, token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
    return t.access_token;
  } catch (e) {
    throw new Error(`Google access expired or was revoked (${(e as Error).message}). Reconnect the Google account in Business setup.`);
  }
}

async function gapi(token: string, url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw Object.assign(new Error(`Google ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: r.status });
  return r.status === 204 ? null : r.json();
}

// ---- Gmail -> inbox ----
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
const decode = (d = "") => Buffer.from(d, "base64url").toString("utf8");
function textOf(p: Part, type: string): string {
  if (p.mimeType === type && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) {
    const t = textOf(c, type);
    if (t) return t;
  }
  return "";
}

export function toInbox(m: { id: string; threadId: string; internalDate: string; payload: Part }): InboxMessage {
  const h = (n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
  const html = textOf(m.payload, "text/html")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const body = (textOf(m.payload, "text/plain") || html).replace(/\r/g, "").trim();
  return {
    id: `G-${m.id}`,
    from: h("from"),
    subject: h("subject") || "(no subject)",
    body: body.slice(0, 4000), // keeps long quoted threads from blowing up the AI prompt
    receivedAt: iso(Number(m.internalDate)),
    read: false,
    threadId: m.threadId,
    messageId: h("message-id"),
  };
}

type GEvent = { id: string; status?: string; transparency?: string; summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string } };
export const toSlots = (items: GEvent[]): CalendarSlot[] =>
  items
    // shortcut: all-day events (holidays, birthdays) are not treated as busy; count them if sellers block whole days that way
    .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      id: `G-${e.id}`,
      title: e.summary || "Busy",
      start: iso(Date.parse(e.start!.dateTime!)),
      end: iso(Date.parse(e.end!.dateTime!)),
      kind: "personal",
    }));

/** Before an order check: new "Orders" mail into the inbox, the seller's own Google Calendar events into the calendar. */
export async function pullGoogle() {
  const s = await readState(),
    g = s.google;
  if (!g) return;
  const t = await accessToken(g);
  const list = await gapi(t, `${GMAIL}/messages?${new URLSearchParams({ labelIds: g.ordersLabel, q: "-from:me", maxResults: "20" })}`);
  const known = new Set(s.inbox.map((m) => m.id));
  const fresh = await Promise.all(
    ((list.messages ?? []) as { id: string }[])
      .filter((m) => !known.has(`G-${m.id}`))
      .map((m) => gapi(t, `${GMAIL}/messages/${m.id}?format=full`)),
  );
  const events = await gapi(
    t,
    `${CAL}/calendars/primary/events?${new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 60 * 864e5).toISOString(),
    })}`,
  );
  const busy = toSlots(events.items ?? []);
  await updateState((s) => {
    for (const m of fresh.map(toInbox)) if (!s.inbox.some((x) => x.id === m.id)) s.inbox.push(m);
    s.calendar = s.calendar.filter((c) => !c.id.startsWith("G-")).concat(busy);
    if (s.google) delete s.google.error;
  });
}

// ---- app -> Gmail and Calendar ----
const header = (v: string) => {
  const clean = v.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean).toString("base64")}?=`;
};
export function mime(p: Extract<ProposalPayload, { kind: "customer_reply" }>, m: InboxMessage, from: string) {
  return Buffer.from(
    [
      `From: ${header(from)}`,
      `To: ${header(p.to)}`,
      `Subject: ${header(p.subject)}`,
      ...(m.messageId ? [`In-Reply-To: ${header(m.messageId)}`, `References: ${header(m.messageId)}`] : []),
      "Content-Type: text/plain; charset=UTF-8",
      "",
      p.body,
    ].join("\r\n"),
  ).toString("base64url");
}

// Calendar event ids may only use a-v and 0-9, so the slot id goes in as hex.
export const eventId = (slotId: string) => `op${Buffer.from(slotId).toString("hex")}`;

/** Make Gmail and the OrderPulse calendar match the app. Idempotent; call after anything that changes proposals or the calendar. */
async function push() {
  const s = await readState(),
    g = s.google;
  if (!g) return;
  const t = await accessToken(g);
  const errors: string[] = [];
  const drafts = { ...g.drafts },
    processed: string[] = [];
  const source = (runId: string) => {
    const id = s.runs.find((r) => r.id === runId)?.input;
    return s.inbox.find((m) => m.id === id && m.threadId);
  };

  for (const p of s.proposals) {
    const m = source(p.runId);
    if (!m) continue; // demo and manual orders never leave the app
    try {
      if (p.payload.kind === "customer_reply") {
        const raw = mime(p.payload, m, g.email),
          hash = createHash("sha256").update(raw).digest("hex"),
          d = drafts[p.id];
        if (p.status === "pending_approval") {
          if (!d) drafts[p.id] = { id: (await gapi(t, `${GMAIL}/drafts`, "POST", { message: { raw, threadId: m.threadId } })).id, hash };
          else if (d.hash !== hash) {
            await gapi(t, `${GMAIL}/drafts/${d.id}`, "PUT", { message: { raw, threadId: m.threadId } });
            drafts[p.id] = { ...d, hash };
          }
          continue;
        }
        // Reserve before sending: a failed or interrupted send is reported, never repeated (no double emails).
        const mine =
          p.status === "executed" &&
          (await updateState((x) => {
            if (!x.google || x.google.sent.includes(p.id)) return false;
            x.google.sent.push(p.id);
            return true;
          }));
        if (mine) {
          await gapi(t, `${GMAIL}/messages/send`, "POST", { raw, threadId: m.threadId });
          await updateState((x) => {
            x.audit.unshift({ at: now(), actor: "seller", action: "sent via Gmail", proposalId: p.id, detail: `Reply to ${p.payload.kind === "customer_reply" ? p.payload.to : ""} from ${g.email}` });
          });
        }
        if (d) {
          delete drafts[p.id];
          await gapi(t, `${GMAIL}/drafts/${d.id}`, "DELETE").catch(() => {}); // already sent or deleted in Gmail
        }
      }
      if (p.payload.kind === "sheet_row" && p.status === "executed" && !g.processed.includes(m.id) && !processed.includes(m.id)) {
        await gapi(t, `${GMAIL}/messages/${m.id.slice(2)}/modify`, "POST", {
          removeLabelIds: [g.ordersLabel, "UNREAD"],
          addLabelIds: [g.processedLabel],
        });
        processed.push(m.id);
      }
    } catch (e) {
      errors.push(`${p.id}: ${(e as Error).message}`);
    }
  }

  // Calendar: upcoming prep, pickup and reminder slots mirrored into the OrderPulse calendar.
  try {
    const cal = `${CAL}/calendars/${encodeURIComponent(g.calendarId)}/events`;
    const want = new Map(
      s.calendar
        .filter((c) => c.kind !== "personal" && !c.id.startsWith("G-") && Date.parse(c.end) > Date.now())
        .map((c) => [eventId(c.id), c]),
    );
    const have = new Set<string>(
      ((await gapi(t, `${cal}?${new URLSearchParams({ timeMin: new Date().toISOString(), maxResults: "250" })}`)).items ?? []).map((e: { id: string }) => e.id),
    );
    for (const [id, c] of want) {
      if (have.has(id)) continue;
      const ev = { id, summary: c.title, start: { dateTime: c.start }, end: { dateTime: c.end }, status: "confirmed" };
      await gapi(t, cal, "POST", ev).catch((e) =>
        e.status === 409 ? gapi(t, `${cal}/${id}`, "PUT", ev) : Promise.reject(e), // the id was used by an event deleted earlier
      );
    }
    for (const id of have) if (id.startsWith("op") && !want.has(id)) await gapi(t, `${cal}/${id}`, "DELETE");
  } catch (e) {
    errors.push(`calendar: ${(e as Error).message}`);
  }

  await updateState((x) => {
    if (!x.google) return;
    x.google.drafts = drafts;
    x.google.processed.push(...processed);
    if (errors.length) {
      x.google.error = errors[0];
      x.audit.unshift({ at: now(), actor: "agent", action: "google_sync_failed", detail: errors.join("\n") });
    } else delete x.google.error;
  });
}

/** Never throws: approval already happened in the app; Google problems are shown, not rolled back. */
export async function pushGoogle() {
  try {
    await push();
  } catch (e) {
    await updateState((x) => {
      if (!x.google) return;
      x.google.error = (e as Error).message;
      x.audit.unshift({ at: now(), actor: "agent", action: "google_sync_failed", detail: (e as Error).message });
    }).catch(() => {});
  }
}
