import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "../seed/state.json" with { type: "json" };
import type { State } from "../shared/types.ts";
import { eventId, mime, publicState, session, sessionEmail, toInbox, toSlots } from "./google.ts";

process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.OWNER_EMAILS = "Seller@Gmail.com, helper@gmail.com";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const cookie = (v: string) => `theme=dark; op_session=${v}`;

test("session cookie: owners and the agent pass; tampered, expired or removed accounts do not", () => {
  assert.equal(sessionEmail(cookie(session("seller@gmail.com"))), "seller@gmail.com");
  assert.equal(sessionEmail(cookie(session("agent"))), "agent");
  const [body, sig] = session("seller@gmail.com").split(".");
  assert.equal(sessionEmail(cookie(`${b64("helper@gmail.com|9999999999999")}.${sig}`)), null);
  assert.equal(sessionEmail(cookie(`${body}.${sig.slice(1)}x`)), null);
  assert.equal(sessionEmail(cookie(session("seller@gmail.com", -1))), null);
  assert.equal(sessionEmail(cookie(session("stranger@gmail.com"))), null);
  assert.equal(sessionEmail(undefined), null);
});

test("Gmail message becomes an inbox message: plain text preferred, HTML stripped as fallback", () => {
  const headers = [
    { name: "From", value: "Asha <asha@example.com>" },
    { name: "Subject", value: "Cake order" },
    { name: "Message-ID", value: "<abc@mail.gmail.com>" },
  ];
  const plain = toInbox({
    id: "18c",
    threadId: "t1",
    internalDate: String(Date.parse("2026-11-26T10:00:00+05:30")),
    payload: { headers, mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: b64("<p>ignored</p>") } },
      { mimeType: "text/plain", body: { data: b64("1 kg chocolate cake\r\nSaturday 5 pm") } },
    ] },
  });
  assert.deepEqual(plain, {
    id: "G-18c", from: "Asha <asha@example.com>", subject: "Cake order",
    body: "1 kg chocolate cake\nSaturday 5 pm", receivedAt: "2026-11-26T10:00:00+05:30",
    read: false, threadId: "t1", messageId: "<abc@mail.gmail.com>",
  });
  const html = toInbox({ id: "x", threadId: "t", internalDate: "0", payload: { headers, mimeType: "text/html",
    body: { data: b64(`<style>p{}</style><p>2 kg&nbsp;cake</p>${"a".repeat(5000)}`) } } });
  assert.ok(html.body.startsWith("2 kg cake\n"));
  assert.equal(html.body.length, 4000);
});

test("only timed, busy, live Google events count for clashes", () => {
  const at = (h: number) => ({ dateTime: `2026-11-28T${h}:00:00+05:30` });
  const slots = toSlots([
    { id: "a", summary: "Dentist", start: at(16), end: at(17) },
    { id: "b", start: { date: "2026-11-28" } as never, end: { date: "2026-11-29" } as never },
    { id: "c", transparency: "transparent", start: at(10), end: at(11) },
    { id: "d", status: "cancelled", start: at(12), end: at(13) },
  ]);
  assert.deepEqual(slots, [{ id: "G-a", title: "Dentist", start: "2026-11-28T16:00:00+05:30", end: "2026-11-28T17:00:00+05:30", kind: "personal" }]);
});

test("reply MIME threads to the source message and cannot smuggle headers", () => {
  const raw = Buffer.from(mime(
    { kind: "customer_reply", to: "asha@example.com\r\nBcc: evil@example.com", subject: "Re: Cake order ✓", body: "Hi Asha" },
    { id: "G-1", from: "", subject: "", body: "", receivedAt: "", read: false, threadId: "t", messageId: "<abc@x>" },
    "seller@gmail.com",
  ), "base64url").toString();
  const head = raw.split("\r\n\r\n")[0];
  assert.ok(!/^Bcc:/m.test(head));
  assert.match(head, /^To: asha@example.com Bcc: evil@example.com$/m);
  assert.match(head, /^In-Reply-To: <abc@x>$/m);
  assert.match(head, /^Subject: =\?UTF-8\?B\?/m);
  assert.ok(raw.endsWith("\r\n\r\nHi Asha"));
});

test("the browser never receives the Google refresh token", () => {
  const s = structuredClone(seed as State);
  s.google = { email: "seller@gmail.com", refreshToken: "SECRET", ordersLabel: "L1", processedLabel: "L2", calendarId: "c", drafts: {}, sent: [], processed: [] };
  const out = JSON.stringify(publicState(s, "seller@gmail.com"));
  assert.ok(!out.includes("SECRET") && !out.includes("L1"));
  assert.match(out, /"google":\{"email":"seller@gmail.com"\}/);
});

test("calendar event ids use only Google's allowed characters", () => {
  assert.match(eventId("C-mi3x9k2"), /^[a-v0-9]{5,1024}$/);
});
