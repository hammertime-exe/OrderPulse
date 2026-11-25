import Icon, { type IconName } from "./Icon.tsx";
import OrderWorkspace from "./OrderWorkspace.tsx";
import InventoryWorkspace from "./InventoryWorkspace.tsx";
import AgentWorkspace from "./AgentWorkspace.tsx";
import AidScoutWorkspace from "./AidScoutWorkspace.tsx";
import HistoryWorkspace from "./HistoryWorkspace.tsx";
import { api, Notifications, SourceLink, notify } from "./ui.tsx";
import WorkspaceSetup from "./WorkspaceSetup.tsx";
import ProposalEditor from "./ProposalEditor.tsx";
import { useEffect, useState, type ReactNode } from "react";
import type { Proposal, Run, State } from "../../shared/types.ts";

const post = api;

const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const when = (iso: string) => fmt.format(new Date(iso));

const TABS = [
  "Overview",
  "Orders",
  "Inventory",
  "Calendar",
  "Agent activity",
  "Approval desk",
  "AidScout",
  "History",
  "Business setup",
] as const;
const ICONS: IconName[] = [
  "overview",
  "orders",
  "inventory",
  "calendar",
  "activity",
  "approval",
  "compass",
  "history",
  "settings",
];
const DESCRIPTIONS: Record<string, string> = {
  Overview: "A little clarity for your busy day.",
  Orders: "Every request, every detail, in one place.",
  Inventory: "Know what you have before you promise.",
  Calendar: "Make room for your next great order.",
  "Agent activity": "Follow the work, one verified step at a time.",
  "Approval desk": "You have the final say.",
  AidScout: "Find opportunities with sources you can check.",
  History: "A clear record of every decision.",
  "Business setup": "A workspace that fits what you create.",
};
type Tab = (typeof TABS)[number];

export default function App() {
  const [s, setS] = useState<State | null>(null);
  const [tab, setTabState] = useState<Tab>("Overview");
  const [setupDirty, setSetupDirty] = useState(false);
  const setTab = (next: Tab) => {
    if (next === tab) return;
    if (
      setupDirty &&
      !confirm("Discard unsaved business settings and leave this screen?")
    )
      return;
    setSetupDirty(false);
    setTabState(next);
  };
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/state")
        .then((r) => {
          if (!r.ok) throw new Error("API is unavailable");
          return r.json();
        })
        .then((x) => alive && (setS(x), setError("")))
        .catch((e) => alive && setError(String(e)));
    load();
    window.addEventListener("orderpulse:refresh", load);
    const t = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("orderpulse:refresh", load);
    };
  }, []);

  if (!s)
    return (
      <main className="loading-screen">
        <div className="brand-mark">O</div>
        <h1>OrderPulse</h1>
        <p>
          {error
            ? `Cannot reach the API: ${error}`
            : "Getting your workspace ready…"}
        </p>
      </main>
    );
  const pending = s.proposals.filter((p) => p.status === "pending_approval");
  const start = async (kind: Run["kind"], input?: string) => {
    if (starting) return;
    setStarting(true);
    setActionError("");
    try {
      await post("/api/runs", { kind, input }, "Agent run started.");
      setTab("Agent activity");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Overview");
          }}
        >
          <span className="brand-mark">
            O<span />
          </span>
          OrderPulse<span className="brand-dot">.</span>
        </a>
        <button
          type="button"
          className="workspace"
          aria-label="Open business settings"
          onClick={() => setTab("Business setup")}
        >
          <span className="workspace-avatar">S</span>
          <div>
            <b>{s.business?.name ?? "Seller workspace"}</b>
            <small>
              {s.business?.category ?? "baker"} · business workspace
            </small>
          </div>
          <span className="workspace-chevron">
            <Icon name="chevronRight" size={16} />
          </span>
        </button>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {TABS.map((t, i) => (
            <button
              key={t}
              title={t}
              aria-label={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`nav-item ${tab === t ? "active" : ""}`}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name={ICONS[i]} />
              </span>
              {t}
              {t === "Approval desk" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
              {t === "AidScout" && <span className="new-label">EXTRA</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="shield">
            <Icon name="shield" />
          </span>
          <b>Your business. Your call.</b>
          <p>Review proposed changes before the agent puts them into action.</p>
        </div>
        <div className="sidebar-footer">
          <span className="user-avatar">S</span>
          <div>
            <b>Demo seller</b>
            <small>Synthetic demo data</small>
          </div>
          <span className="online-dot" />
        </div>
      </aside>
      <Notifications />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{tab}</b>
          </div>
          <div className="topbar-right">
            <span className={`connection ${error ? "offline" : ""}`}>
              <i />
              {error ? "Connection issue" : "Workspace connected"}
            </span>
            <span className="user-avatar small">S</span>
          </div>
        </header>
        <main className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR BUSINESS, IN SYNC</p>
              <h1>{tab === "Overview" ? "A clearer view of your day" : tab}</h1>
              <p className="page-subtitle">{DESCRIPTIONS[tab]}</p>
            </div>
            <span className="date-chip">
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date())}
            </span>
          </div>
          {(error || actionError) && (
            <div role="alert" className="error-banner">
              {error || actionError}
              <button
                className="text-button"
                onClick={() => {
                  if (error) location.reload();
                  else setActionError("");
                }}
              >
                {error ? "Reconnect" : "Dismiss"}
              </button>
            </div>
          )}
          {tab === "Overview" && (
            <Overview
              s={s}
              pending={pending}
              onCheck={() => start("order")}
              navigate={setTab}
            />
          )}
          {tab === "Orders" && (
            <OrderWorkspace
              s={s}
              onApprovals={() => setTab("Approval desk")}
              onRun={(id) => start("order", id)}
            />
          )}
          {tab === "Inventory" && (
            <InventoryWorkspace
              s={s}
              onSetup={() => setTab("Business setup")}
            />
          )}
          {tab === "Calendar" && <Planner s={s} />}
          {tab === "Agent activity" && (
            <AgentWorkspace s={s} onApprovals={() => setTab("Approval desk")} />
          )}
          {tab === "Approval desk" && <Desk s={s} pending={pending} />}
          {tab === "AidScout" && (
            <AidScoutWorkspace
              s={s}
              onRun={(url) => start("aidscout", url)}
              onApprovals={() => setTab("Approval desk")}
            />
          )}
          {tab === "History" && <HistoryWorkspace s={s} />}
          {tab === "Business setup" && (
            <WorkspaceSetup s={s} onDirtyChange={setSetupDirty} />
          )}
          <footer className="page-footer">
            <span>OrderPulse · Made for the way you work</span>
            <span>Review first. Act with confidence.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Overview({
  s,
  pending,
  onCheck,
  navigate,
}: {
  s: State;
  pending: Proposal[];
  onCheck: () => void;
  navigate: (tab: Tab) => void;
}) {
  const unread = s.inbox.filter((m) => !m.read);
  const pickups = s.orders
    .filter((o) => o.status === "confirmed")
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const latest = s.runs.find((r) => r.kind === "order" && r.report);
  const running = s.runs.some((r) => r.status === "running");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const reset = async () => {
    if (
      !confirm(
        "Reset all demo orders, approvals and history to the original data?",
      )
    )
      return;
    setResetting(true);
    try {
      const r = await post("/api/reset");
      if (r.error) throw new Error(r.error);
    } catch (e) {
      setResetError(String(e));
    } finally {
      setResetting(false);
    }
  };
  return (
    <>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="banner-label">
            <span className="pulse-dot" /> YOUR ORDER ASSISTANT
          </span>
          <h2>
            Less juggling.
            <br />
            More creating.
          </h2>
          <p>
            Let your agent check new requests against stock and schedules. You
            review the plan and decide what happens next.
          </p>
          <button
            className="primary-button"
            disabled={running}
            onClick={onCheck}
          >
            {running ? "Checking your workspace…" : "Check new orders"}{" "}
            <span aria-hidden="true">
              <Icon name="arrow" />
            </span>
          </button>
        </div>
        <div className="workflow-art" aria-hidden="true">
          <div className="orbit-ring" />
          <div className="art-card art-inbox">
            <span className="art-symbol">
              <Icon name="orders" />
            </span>
            <div>
              <b>New request</b>
              <small>Details collected</small>
            </div>
            <span className="art-check">
              <Icon name="check" />
            </span>
          </div>
          <div className="art-card art-calendar">
            <span className="art-symbol violet">
              <Icon name="calendar" />
            </span>
            <div>
              <b>Schedule checked</b>
              <small>Finding the right fit</small>
            </div>
            <span className="art-check">
              <Icon name="check" />
            </span>
          </div>
          <div className="art-card art-approval">
            <span className="art-symbol green">
              <Icon name="check" />
            </span>
            <div>
              <b>Ready for your review</b>
              <small>You’re always in control</small>
            </div>
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {[
          {
            label: "New messages",
            value: unread.length,
            icon: "mail" as IconName,
            color: "blue",
            note: "Ready for an order check",
            target: "Orders",
          },
          {
            label: "Confirmed pickups",
            value: pickups.length,
            icon: "calendar" as IconName,
            color: "violet",
            note: "View your production plan",
            target: "Calendar",
          },
          {
            label: "Flagged conflicts",
            value: latest?.report?.clashes.length ?? 0,
            icon: "alert" as IconName,
            color: "amber",
            note: "From the latest order check",
            target: "Agent activity",
          },
          {
            label: "Awaiting approval",
            value: pending.length,
            icon: "approval" as IconName,
            color: "green",
            note: "Your decision comes next",
            target: "Approval desk",
          },
        ].map((m) => (
          <button
            className="stat-card"
            key={m.label}
            onClick={() => navigate(m.target as Tab)}
          >
            <div className="stat-top">
              <span>{m.label}</span>
              <span className={`stat-icon ${m.color}`}>
                <Icon name={m.icon} size={18} />
              </span>
            </div>
            <strong>{m.value.toString().padStart(2, "0")}</strong>
            <small>
              {m.note}{" "}
              <span>
                <Icon name="arrow" />
              </span>
            </small>
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Incoming requests</h2>
              <p>A closer look at your inbox</p>
            </div>
            <button className="text-button" onClick={() => navigate("Orders")}>
              View all <Icon name="arrow" size={15} />
            </button>
          </div>
          {s.inbox.slice(0, 3).map((m) => (
            <details className="message-row" key={m.id}>
              <summary>
                <span className="customer-avatar">{m.from.charAt(0)}</span>
                <span className="message-copy">
                  <b>{m.subject}</b>
                  <small>{m.from.split("<")[0]}</small>
                </span>
                <span className={`badge ${m.read ? "neutral" : "blue"}`}>
                  {m.read ? "Read" : "New"}
                </span>
              </summary>
              <p className="message-body">{m.body}</p>
            </details>
          ))}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>On the schedule</h2>
              <p>Confirmed customer pickups</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("Calendar")}
            >
              View calendar <Icon name="arrow" size={15} />
            </button>
          </div>
          {pickups.length ? (
            pickups.slice(0, 3).map((o) => (
              <div className="pickup-row" key={o.id}>
                <div className="date-block">
                  <small>
                    {new Date(o.pickupAt).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      month: "short",
                    })}
                  </small>
                  <b>
                    {new Date(o.pickupAt).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                    })}
                  </b>
                </div>
                <div>
                  <b>{o.customer}</b>
                  <p>
                    {o.quantity} {s.recipes[o.product]?.unit} · {o.product}
                  </p>
                  <small>{when(o.pickupAt)}</small>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="No pickups scheduled"
              text="Approved orders will appear here."
            />
          )}
        </section>
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Needs your attention</h2>
              <p>Check the evidence before making a promise</p>
            </div>
            <span className="attention-icon">
              <Icon name="alert" size={16} />
            </span>
          </div>
          {latest?.report?.clashes.length ? (
            <Clashes run={latest} />
          ) : (
            <Empty
              title="A fresh start"
              text="Run an order check to uncover stock or scheduling conflicts."
            />
          )}
        </section>
        <section className="aid-teaser">
          <span className="eyebrow">A LITTLE EXTRA SUPPORT</span>
          <h2>
            Your next opportunity
            <br />
            could be one check away.
          </h2>
          <p>
            Use AidScout to check official portals and build a checklist backed
            by sources.
          </p>
          <button className="text-button" onClick={() => navigate("AidScout")}>
            Explore AidScout{" "}
            <span>
              <Icon name="arrow" />
            </span>
          </button>
          <span className="sparkle" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
        </section>
      </div>
      <div className="demo-tools">
        <span>Demo workspace · all customer data is synthetic</span>
        <button disabled={resetting} onClick={reset}>
          {resetting ? "Resetting…" : "Reset demo data"}
        </button>
        {resetError && <span role="alert">{resetError}</span>}
      </div>
    </>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">
        <Icon name="empty" />
      </span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

const dayKey = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
function Planner({ s }: { s: State }) {
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [kind, setKind] = useState("all");
  const [mode, setMode] = useState("week");
  const first = new Date(anchor + "T12:00:00+05:30");
  const weekday = first.getUTCDay();
  if (mode === "week")
    first.setUTCDate(first.getUTCDate() - ((weekday + 6) % 7));
  const days = Array.from({ length: mode === "week" ? 7 : 1 }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const move = (n: number) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + n);
    setAnchor(dayKey(d));
  };
  return (
    <>
      <div className="toolbar">
        <div className="calendar-controls">
          <button
            aria-label={mode === "week" ? "Previous week" : "Previous day"}
            onClick={() => move(mode === "week" ? -7 : -1)}
          >
            <Icon name="chevronLeft" />
          </button>
          <button onClick={() => setAnchor(dayKey(new Date()))}>
            {mode === "week" ? "This week" : "Today"}
          </button>
          <button
            aria-label={mode === "week" ? "Next week" : "Next day"}
            onClick={() => move(mode === "week" ? 7 : 1)}
          >
            <Icon name="chevronRight" />
          </button>
          <b>
            {days[0].toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
            })}{" "}
            –{" "}
            {days[days.length - 1].toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </b>
        </div>
        <div className="action-group">
          <div className="segmented">
            <button
              aria-pressed={mode === "day"}
              onClick={() => setMode("day")}
            >
              Day
            </button>
            <button
              aria-pressed={mode === "week"}
              onClick={() => setMode("week")}
            >
              Week
            </button>
          </div>
          <input
            type="date"
            aria-label="Jump to calendar date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
          <select
            aria-label="Filter calendar events"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All events</option>
            {["prep", "pickup", "personal", "reminder"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="week-scroll">
        <section className={`week-grid ${mode === "day" ? "day-mode" : ""}`}>
          {days.map((d) => {
            const key = dayKey(d);
            const slots = s.calendar
              .filter(
                (x) =>
                  dayKey(x.start) === key &&
                  (kind === "all" || x.kind === kind),
              )
              .sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div
                className={`week-day ${key === dayKey(new Date()) ? "is-today" : ""}`}
                key={key}
              >
                <header>
                  <span>
                    {d.toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      weekday: "short",
                    })}
                  </span>
                  <b>
                    {d.toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                    })}
                  </b>
                </header>
                <div className="day-slots">
                  {slots.map((x) => (
                    <details
                      className={`calendar-slot slot-${x.kind}`}
                      key={x.id}
                    >
                      <summary>
                        <small>
                          {new Date(x.start).toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                        <b>{x.title}</b>
                        <span>{x.kind}</span>
                      </summary>
                      <p>
                        Until{" "}
                        {new Date(x.end).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {x.orderId && <p>{x.orderId}</p>}
                    </details>
                  ))}
                  {!slots.length && <span className="free-day">No events</span>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
      <div className="calendar-legend">
        {["prep", "pickup", "personal", "reminder"].map((x) => (
          <span key={x}>
            <i className={`slot-${x}`} />
            {x}
          </span>
        ))}
      </div>
    </>
  );
}

function Clashes({ run }: { run: Run }) {
  const r = run.report!;
  return (
    <ul className="text-sm space-y-1">
      {!r.clashes.length && (
        <li className="success-banner">No conflicts found in this check.</li>
      )}
      {r.clashes.map((c, i) => (
        <li key={i} className="border-l-4 border-red-400 pl-2">
          <b className="capitalize">{c.kind}</b>: {c.message}
          {c.evidence && (
            <SourceLink
              url={
                c.kind === "stock"
                  ? "/mock/tracker.html"
                  : "/mock/calendar.html"
              }
            >
              Source: {c.evidence}
            </SourceLink>
          )}
        </li>
      ))}
      {r.alternative && (
        <li className="border-l-4 border-emerald-400 pl-2">
          <b>Nearest feasible pickup</b>: {when(r.alternative.pickupAt)}
        </li>
      )}
    </ul>
  );
}

function Preview({ p }: { p: Proposal }) {
  const x = p.payload;
  switch (x.kind) {
    case "sheet_row":
      return (
        <div>
          {x.previousOrder && (
            <p className="info-banner">
              Updating existing order. Previous pickup:{" "}
              {when(x.previousOrder.pickupAt)} · {x.previousOrder.quantity} ×{" "}
              {x.previousOrder.product}
            </p>
          )}
          <table className="text-sm w-full">
            <tbody>
              {Object.entries({
                ID: x.order.id,
                Customer: x.order.customer,
                Product: x.order.product,
                Qty: x.order.quantity,
                Customisation: x.order.customization,
                Pickup: when(x.order.pickupAt),
              }).map(([k, v]) => (
                <tr key={k}>
                  <th className="text-left pr-3 text-slate-500 font-normal">
                    {k}
                  </th>
                  <td className="text-emerald-800">+ {v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "calendar_event":
      return (
        <p className="text-sm text-emerald-800">
          + {when(x.slot.start)} – {when(x.slot.end)} · {x.slot.title}{" "}
          <span className="text-slate-500">({x.slot.kind})</span>
        </p>
      );
    case "customer_reply":
      return (
        <div className="text-sm">
          <div className="text-slate-500">
            To {x.to} · {x.subject}
          </div>
          <pre className="whitespace-pre-wrap font-sans bg-slate-50 p-2 rounded mt-1">
            {x.body}
          </pre>
        </div>
      );
    case "checklist":
      return (
        <ul className="text-sm list-disc pl-5">
          {x.items.map((i) => (
            <li key={i.id}>
              {i.text}
              <details>
                <summary>Source evidence</summary>
                <blockquote>{i.quote}</blockquote>
                <SourceLink url={i.sourceUrl} />
              </details>
            </li>
          ))}
        </ul>
      );
  }
}

const label: Record<Proposal["payload"]["kind"], string> = {
  sheet_row: "Order tracker row",
  calendar_event: "Calendar event",
  customer_reply: "Customer reply (draft)",
  checklist: "Checklist",
};

function Desk({ s, pending }: { s: State; pending: Proposal[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    setRefreshing(false);
    if (editing && !pending.some((p) => p.id === editing)) setEditing(null);
  }, [s.version]);
  const act = async (action: "approve" | "reject", ids: string[]) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await post(`/api/proposals/${action}`, { ids });
      if (r.error) throw new Error(r.error);
      const failed = (r.results ?? []).filter((x: { ok: boolean }) => !x.ok);
      if (failed.length)
        notify(failed.map((f: { error: string }) => f.error).join("; "), true);
      else
        notify(
          `${ids.length} ${ids.length === 1 ? "change" : "changes"} ${action === "approve" ? "approved" : "rejected"}.`,
        );
      setRefreshing(true);
      setMsg(
        failed.length
          ? `Not written: ${failed.map((f: { error: string }) => f.error).join("; ")}`
          : `${ids.length} ${action === "approve" ? "approved and written" : "rejected"}.`,
      );
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };
  const runs = [...new Set(pending.map((p) => p.runId))];
  return (
    <>
      {msg && (
        <p role="status" className="bg-slate-100 rounded p-2 mb-3 text-sm">
          {msg}
        </p>
      )}
      {!runs.length && (
        <section className="panel">
          <Empty
            title="You’re all caught up"
            text="New order plans, edited orders and AidScout reminders will wait here for your review."
          />
        </section>
      )}
      {runs.map((runId) => {
        const run = s.runs.find((r) => r.id === runId);
        const items = pending.filter((p) => p.runId === runId);
        return (
          <Card
            key={runId}
            title={`${run?.manual ? "Seller draft" : run?.kind === "aidscout" ? "AidScout source check" : "Order check"} · ${runId}`}
          >
            {run?.manual && run.kind === "order" && (
              <p className="info-banner">
                The order and its calendar slots are applied together. Approve
                or reject this complete plan.
              </p>
            )}
            {run?.report && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-500 mb-1">
                  Evidence
                </h3>
                <Clashes run={run} />
              </div>
            )}
            <div className="space-y-3">
              {items.map((p) => (
                <div key={p.id} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <b className="text-sm">{label[p.payload.kind]}</b>
                    <span className="text-xs text-slate-500">{p.reason}</span>
                    {p.payload.kind !== "checklist" &&
                      !(
                        p.payload.kind === "calendar_event" &&
                        p.payload.slot.orderId &&
                        p.payload.slot.kind !== "reminder"
                      ) && (
                        <button
                          disabled={busy || refreshing || editing !== null}
                          className="text-button"
                          onClick={() => setEditing(p.id)}
                        >
                          {p.reviewRequired ? "Review & edit" : "Edit draft"}
                        </button>
                      )}
                    <button
                      disabled={
                        busy ||
                        refreshing ||
                        editing !== null ||
                        !!(run?.manual && run.kind === "order")
                      }
                      onClick={() => act("reject", [p.id])}
                      className="ml-auto text-sm border rounded px-2 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      disabled={
                        busy ||
                        refreshing ||
                        editing !== null ||
                        !!p.reviewRequired ||
                        (p.payload.kind === "customer_reply" &&
                          items.some(
                            (item) =>
                              item.payload.kind === "sheet_row" ||
                              (item.payload.kind === "calendar_event" &&
                                item.payload.slot.kind !== "reminder"),
                          )) ||
                        !!(run?.manual && run.kind === "order")
                      }
                      onClick={() => act("approve", [p.id])}
                      className="individual-approve"
                    >
                      Approve
                    </button>
                  </div>
                  <Preview p={p} />
                  {p.reviewRequired && (
                    <p className="review-note">
                      Order details changed. Review and save this reply before
                      approval.
                    </p>
                  )}
                  {editing === p.id && (
                    <ProposalEditor
                      p={p}
                      s={s}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        setRefreshing(true);
                        setMsg(
                          "Draft saved. Review the updated proposals before approving.",
                        );
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="editor-actions">
              <button
                disabled={busy || refreshing || editing !== null}
                className="secondary-button"
                onClick={() =>
                  act(
                    "reject",
                    items.map((p) => p.id),
                  )
                }
              >
                Reject entire plan
              </button>
              <button
                disabled={
                  busy ||
                  refreshing ||
                  editing !== null ||
                  items.some((p) => p.reviewRequired)
                }
                onClick={() =>
                  act(
                    "approve",
                    items.map((p) => p.id),
                  )
                }
                className="mt-3 bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50"
              >
                Approve all {items.length} and write
              </button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
