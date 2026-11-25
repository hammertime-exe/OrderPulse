import Icon from "./Icon.tsx";
import { useState } from "react";
import type { State } from "../../shared/types.ts";
import { Empty, SourceLink, when } from "./ui.tsx";
export default function HistoryWorkspace({ s }: { s: State }) {
  const [query, setQuery] = useState(""),
    [actor, setActor] = useState("all"),
    [action, setAction] = useState("all"),
    [tab, setTab] = useState("activity"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const text = query.toLowerCase();
  const entries = s.audit.filter((a) => {
    const day = new Date(Date.parse(a.at) + 5.5 * 3600000)
      .toISOString()
      .slice(0, 10);
    return (
      (actor === "all" || a.actor === actor) &&
      (action === "all" || a.action === action) &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      `${a.action} ${a.detail} ${a.source ?? ""} ${a.proposalId ?? ""}`
        .toLowerCase()
        .includes(text)
    );
  });
  const sent = [...s.sent].reverse().filter((m) => {
    const day = new Date(Date.parse(m.at) + 5.5 * 3600000)
      .toISOString()
      .slice(0, 10);
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      `${m.subject} ${m.to} ${m.body}`.toLowerCase().includes(text)
    );
  });
  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          <button
            aria-pressed={tab === "activity"}
            onClick={() => setTab("activity")}
          >
            Activity log
          </button>
          <button
            aria-pressed={tab === "outbox"}
            onClick={() => setTab("outbox")}
          >
            Demo outbox ({s.sent.length})
          </button>
        </div>
        <label className="search-field">
          <span>
            <Icon name="search" />
          </span>
          <input
            aria-label="Search history"
            placeholder="Search actions, customers or messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <section className="panel">
        <div className="history-filters">
          {tab === "activity" && (
            <>
              <label className="form-field">
                Who
                <select
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                >
                  <option value="all">Everyone</option>
                  <option value="agent">Agent</option>
                  <option value="seller">Seller</option>
                </select>
              </label>
              <label className="form-field">
                Action
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  <option value="all">All actions</option>
                  {[...new Set(s.audit.map((a) => a.action))].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="form-field">
            From (IST)
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="form-field">
            To (IST)
            <input
              type="date"
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setActor("all");
              setAction("all");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </button>
        </div>
        {from && to && from > to ? (
          <p className="error-banner" role="alert">
            Choose an end date on or after the start date.
          </p>
        ) : tab === "activity" ? (
          <>
            <div className="panel-heading">
              <h2>Audit trail</h2>
              <span className="count-label">
                {entries.length} matching actions
              </span>
            </div>
            {entries.map((a, i) => {
              const p = s.proposals.find((p) => p.id === a.proposalId);
              return (
                <details className="audit-entry" key={`${a.at}-${i}`}>
                  <summary>
                    <span
                      className={`badge ${a.actor === "agent" ? "violet" : "blue"}`}
                    >
                      {a.actor}
                    </span>
                    <b>{a.action.replaceAll("_", " ")}</b>
                    <small>{when(a.at)}</small>
                    <span>
                      <Icon name="chevronDown" />
                    </span>
                  </summary>
                  <p>{a.detail}</p>
                  {a.source && <SourceLink url={a.source} />}
                  {p && (
                    <div className="source-box">
                      <b>
                        Proposal {p.id} · {p.status.replaceAll("_", " ")}
                      </b>
                      <p>{p.reason}</p>
                      <pre>{JSON.stringify(p.payload, null, 2)}</pre>
                    </div>
                  )}
                </details>
              );
            })}
            {!entries.length && (
              <Empty
                title="No matching activity"
                text={
                  s.audit.length
                    ? "Try a wider date range or clear your filters."
                    : "Approvals, edits and stock adjustments will be recorded here."
                }
              />
            )}
          </>
        ) : (
          <>
            <div className="panel-heading">
              <h2>Sent messages</h2>
              <span className="badge neutral">Demo only</span>
            </div>
            <p className="info-banner">
              These replies are stored inside the demo. No external messages
              have been sent.
            </p>
            {sent.map((m) => (
              <details className="audit-entry" key={m.proposalId}>
                <summary>
                  <span className="customer-avatar">
                    {m.to[0].toUpperCase()}
                  </span>
                  <b>{m.subject}</b>
                  <small>{when(m.at)}</small>
                </summary>
                <p className="field-help">To: {m.to}</p>
                <pre className="outbox-body">{m.body}</pre>
              </details>
            ))}
            {!sent.length && (
              <Empty
                title="No matching messages"
                text="Approved customer replies will appear here."
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
