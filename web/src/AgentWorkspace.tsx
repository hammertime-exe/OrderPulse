import Icon from "./Icon.tsx";
import { useState } from "react";
import type { Phase, State } from "../../shared/types.ts";
import { api, Empty, SourceLink, when } from "./ui.tsx";
import { ConflictEvidence, MaterialEvidence } from "./OrderWorkspace.tsx";
const phases: Phase[] = [
  "CHECK",
  "VERIFY",
  "REASON",
  "PREPARE",
  "APPROVE",
  "EXECUTE",
];
export default function AgentWorkspace({
  s,
  onApprovals,
}: {
  s: State;
  onApprovals: () => void;
}) {
  const [id, setId] = useState(""),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false);
  const run = s.runs.find((r) => r.id === id) ?? s.runs[0];
  if (!run)
    return (
      <section className="panel">
        <Empty
          title="Your agent is ready"
          text="Start an order check from Overview or a portal check from AidScout. Its steps and browser evidence will appear here."
        />
      </section>
    );
  const reached = new Set(run.steps.map((x) => x.phase)),
    current = run.steps.at(-1)?.phase;
  const steps = run.steps.filter((x) => filter === "all" || x.phase === filter);
  const orderDraft = s.proposals.find(
    (p) => p.runId === run.id && p.payload.kind === "sheet_row",
  );
  const pending = s.proposals.filter(
    (p) => p.runId === run.id && p.status === "pending_approval",
  );
  const url = [...run.steps].reverse().find((x) => x.url)?.url;
  const retry = async () => {
    setBusy(true);
    try {
      const r = await api(
        "/api/runs/retry",
        { id: run.id },
        "A new agent attempt has started.",
      );
      setId(r.runId);
      setFilter("all");
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="toolbar">
        <label className="form-field inline-field">
          Run
          <select
            value={run.id}
            onChange={(e) => {
              setId(e.target.value);
              setFilter("all");
            }}
          >
            {s.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.manual
                  ? "Seller draft"
                  : r.kind === "order"
                    ? "Order check"
                    : "Portal check"}{" "}
                · {r.startedAt ? when(r.startedAt) : r.id} ·{" "}
                {r.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="action-group">
          <span
            className={`badge ${run.status === "failed" ? "amber" : run.status === "running" ? "blue" : "green"}`}
          >
            {run.status.replaceAll("_", " ")}
          </span>
          {pending.length > 0 && (
            <button className="primary-button" onClick={onApprovals}>
              Review {pending.length} changes <Icon name="arrow" size={15} />
            </button>
          )}
          {run.status === "failed" &&
            !run.manual &&
            !s.proposals.some((p) => p.runId === run.id) && (
              <button
                className="secondary-button"
                disabled={busy || s.runs.some((r) => r.status === "running")}
                onClick={retry}
              >
                {busy ? "Starting…" : "Retry run"}
              </button>
            )}
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {run.manual ? "Seller-entered draft" : "Live agent progress"}
            </h2>
            <p>
              {run.manual
                ? "This draft was created from the order form."
                : "Steps update as the agent works. Execution waits for your approval."}
            </p>
          </div>
          {run.status === "running" && (
            <span className="live-indicator">
              <i /> Live
            </span>
          )}
        </div>
        <ol className="phase-track">
          {phases.map((phase, i) => (
            <li
              key={phase}
              className={`${reached.has(phase) ? "reached" : ""} ${phase === current ? "current" : ""}`}
            >
              <span>
                {reached.has(phase) ? <Icon name="check" size={15} /> : i + 1}
              </span>
              <b>{phase.toLowerCase()}</b>
            </li>
          ))}
        </ol>
        {run.error && (
          <div role="alert" className="error-banner">
            <b>Run could not finish</b>
            <p>{run.error}</p>
            <p className="field-help">
              Check the browser installation and AI key configuration, then
              retry. Staged changes can be reviewed separately.
            </p>
          </div>
        )}
      </section>
      <div className="agent-workspace-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Activity timeline{" "}
              <span className="count-label">{steps.length}</span>
            </h2>
            <select
              aria-label="Filter activity phases"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All steps</option>
              {phases.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <ol className="timeline-list">
            {steps.map((x, i) => (
              <li key={`${x.at}-${i}`}>
                <span className="timeline-dot" />
                <div className="timeline-heading">
                  <span className="badge violet">{x.phase}</span>
                  <small>
                    {new Date(x.at).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                    IST
                  </small>
                </div>
                <h3>{x.action}</h3>
                {x.url && <SourceLink url={x.url} />}
                {x.detail && (
                  <details>
                    <summary>View observed details</summary>
                    <pre>{x.detail}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {!steps.length && (
            <Empty
              title={
                run.status === "running"
                  ? "Waiting for the first step"
                  : "No steps in this phase"
              }
              text="Try a different phase filter."
            />
          )}
        </section>
        <div>
          <section className="panel browser-evidence">
            <div className="panel-heading">
              <h2>Browser evidence</h2>
              <span className="badge neutral">
                {run.preview ? "Captured page" : "Source links"}
              </span>
            </div>
            {run.preview ? (
              <>
                <img
                  src={run.preview.dataUrl}
                  alt={`Browser capture of ${run.preview.url}`}
                />
                <p className="field-help">
                  Captured {when(run.preview.at)}. This is a snapshot, not a
                  live browser stream.
                </p>
                <SourceLink url={run.preview.url} />
              </>
            ) : (
              <Empty
                title={
                  run.manual ? "No browser used" : "No capture available yet"
                }
                text={
                  run.manual
                    ? "This run contains seller-entered changes."
                    : "A browser capture appears when the agent observes a page. Only the latest run capture is retained."
                }
              />
            )}
            {url && (
              <SourceLink url={url}>
                Open most recently observed page
              </SourceLink>
            )}
          </section>
          {run.request && (
            <section className="panel">
              <h2>Order evidence</h2>
              <MaterialEvidence
                s={s}
                request={run.request}
                excludeOrderId={
                  orderDraft?.payload.kind === "sheet_row"
                    ? orderDraft.payload.order.id
                    : undefined
                }
              />
              <ConflictEvidence report={run.report} s={s} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
