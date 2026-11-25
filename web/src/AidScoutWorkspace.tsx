import Icon from "./Icon.tsx";
import { useState } from "react";
import type { State } from "../../shared/types.ts";
import { api, Empty, istTime, Modal, SourceLink, when } from "./ui.tsx";
const portals = [
  {
    title: "Udyam registration",
    url: "https://udyamregistration.gov.in/",
    category: "Business",
    description:
      "Start a source check for small-business registration information.",
  },
  {
    title: "Ministry of MSME",
    url: "https://msme.gov.in/",
    category: "Business",
    description: "Explore information from the ministry’s official portal.",
  },
  {
    title: "National Scholarship Portal",
    url: "https://scholarships.gov.in/",
    category: "Education",
    description: "Check official scholarship information for your household.",
  },
  {
    title: "myScheme",
    url: "https://myscheme.gov.in/",
    category: "Schemes",
    description: "Start with an official scheme discovery portal.",
  },
];
export default function AidScoutWorkspace({
  s,
  onRun,
  onApprovals,
}: {
  s: State;
  onRun: (url: string) => void;
  onApprovals: () => void;
}) {
  const [tab, setTab] = useState("explore"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const [url, setUrl] = useState(portals[0].url),
    [taskFilter, setTaskFilter] = useState("all"),
    [busy, setBusy] = useState(false);
  const [reminder, setReminder] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const runs = s.runs.filter((r) => r.kind === "aidscout" && !r.manual);
  const lists = s.proposals.filter(
    (p) => p.payload.kind === "checklist" && p.status === "executed",
  );
  const pending = s.proposals.filter(
    (p) =>
      p.status === "pending_approval" &&
      s.runs.find((r) => r.id === p.runId)?.kind === "aidscout",
  );
  const running = s.runs.some((r) => r.status === "running");
  const toggle = async (proposalId: string, itemId: string) => {
    setBusy(true);
    try {
      await api("/api/checklist/toggle", { proposalId, itemId });
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="aid-header">
        <span className="eyebrow">EXTRA SUPPORT, INSIDE ORDERPULSE</span>
        <h2>A clearer path to useful opportunities.</h2>
        <p>
          Explore official starting points, check portal addresses and keep
          source-linked document tasks together.
        </p>
        <span className="aid-star" aria-hidden="true">
          <Icon name="sparkles" />
        </span>
      </section>
      <div className="toolbar">
        <div className="segmented">
          <button
            aria-pressed={tab === "explore"}
            onClick={() => setTab("explore")}
          >
            Explore portals
          </button>
          <button
            aria-pressed={tab === "checks"}
            onClick={() => setTab("checks")}
          >
            Source checks ({runs.length})
          </button>
          <button
            aria-pressed={tab === "tasks"}
            onClick={() => setTab("tasks")}
          >
            Saved checklists ({lists.length})
          </button>
        </div>
        {pending.length > 0 && (
          <button className="primary-button" onClick={onApprovals}>
            Review {pending.length} proposals <Icon name="arrow" size={15} />
          </button>
        )}
      </div>
      {tab === "explore" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Check a portal</h2>
                <p>
                  Host verification is the first step. Page facts still need
                  live source evidence.
                </p>
              </div>
            </div>
            <form
              className="portal-form"
              onSubmit={(e) => {
                e.preventDefault();
                onRun(url);
              }}
            >
              <label className="form-field">
                Portal address
                <input
                  required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://official-portal…"
                />
              </label>
              <button className="primary-button" disabled={running}>
                {running ? (
                  "An agent run is active…"
                ) : (
                  <>
                    Check with Gate 0 <Icon name="arrow" size={15} />
                  </>
                )}
              </button>
            </form>
            <button
              className="text-button"
              onClick={() => setUrl("https://udyamregistration-gov.example/")}
            >
              Use the controlled lookalike test address
            </button>
          </section>
          <div className="toolbar">
            <label className="search-field">
              <span>
                <Icon name="search" />
              </span>
              <input
                aria-label="Search opportunity portals"
                placeholder="Search business, scholarship or scheme portals…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter portal category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["All", "Business", "Education", "Schemes"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="portal-grid">
            {portals
              .filter(
                (p) =>
                  (category === "All" || p.category === category) &&
                  `${p.title} ${p.description} ${p.category}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((p) => (
                <section className="panel portal-card" key={p.url}>
                  <div className="panel-heading">
                    <span className="material-icon">
                      <Icon name="sparkles" />
                    </span>
                    <span className="badge neutral">{p.category}</span>
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  <small>
                    Eligibility, availability and deadlines have not been
                    checked for you.
                  </small>
                  <button
                    className="secondary-button"
                    disabled={running}
                    onClick={() => onRun(p.url)}
                  >
                    Check official source <Icon name="arrow" size={15} />
                  </button>
                </section>
              ))}
          </div>
          {!portals.some(
            (p) =>
              (category === "All" || p.category === category) &&
              `${p.title} ${p.description} ${p.category}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          ) && (
            <Empty
              title="No matching starting points"
              text="Change your filter or enter an official portal URL above."
            />
          )}
          <p className="field-help">
            Gate 0 is a risk screen, not a security certification. A
            non-government domain is not automatically fraudulent. The agent
            does not fill or submit applications.
          </p>
        </>
      )}
      {tab === "checks" && (
        <>
          {runs.map((r) => (
            <section className="panel" key={r.id}>
              <div className="panel-heading">
                <div>
                  <h2>{r.input ?? "Portal check"}</h2>
                  <p>
                    {r.findings
                      ? `Observed ${when(r.findings.checkedAt)}`
                      : r.startedAt
                        ? `Started ${when(r.startedAt)}`
                        : r.id}
                  </p>
                </div>
                <span
                  className={`badge ${r.status === "failed" ? "amber" : "violet"}`}
                >
                  {r.status.replaceAll("_", " ")}
                </span>
              </div>
              {r.gate0?.map((g, i) => (
                <div
                  className={`gate-result ${g.label === "Official source confirmed" ? "gate-good" : g.label === "Potential lookalike" ? "gate-bad" : "gate-unknown"}`}
                  key={i}
                >
                  <b>{g.label}</b>
                  <p className="gate-host">{g.hostname || g.url}</p>
                  <ul>
                    {g.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  {g.label === "Official source confirmed" && (
                    <SourceLink url={g.finalUrl}>
                      Open checked official source
                    </SourceLink>
                  )}
                </div>
              ))}
              {!r.gate0 && (
                <p className="field-help">
                  {r.status === "running"
                    ? "Reading and checking the source…"
                    : (r.error ?? "Source details are unavailable.")}
                </p>
              )}
              {r.findings && (
                <div className="source-box">
                  {r.findings.deadline ? (
                    <>
                      <b>
                        Deadline extracted from the source:{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }).format(new Date(r.findings.deadline.date))}
                      </b>
                      <p>“{r.findings.deadline.quote}”</p>
                      <SourceLink url={r.findings.deadline.url}>
                        Verify the quoted deadline
                      </SourceLink>
                    </>
                  ) : (
                    <p>
                      No supported upcoming deadline was extracted. Task
                      reminders are separate from application deadlines.
                    </p>
                  )}
                </div>
              )}
              <div className="conditions-list">
                {s.proposals
                  .filter(
                    (p) => p.runId === r.id && p.payload.kind === "checklist",
                  )
                  .map(
                    (p) =>
                      p.payload.kind === "checklist" && (
                        <div key={p.id}>
                          <h3>Requirements & document tasks from the source</h3>
                          <p className="field-help">
                            Review these conditions against your situation. A
                            checklist does not confirm personal eligibility.
                          </p>
                          {p.payload.items.map((item) => (
                            <details key={item.id}>
                              <summary>{item.text}</summary>
                              <blockquote>{item.quote}</blockquote>
                              <SourceLink url={item.sourceUrl}>
                                Read original condition
                              </SourceLink>
                            </details>
                          ))}
                        </div>
                      ),
                  )}
              </div>
            </section>
          ))}
          {!runs.length && (
            <section className="panel">
              <Empty
                title="No source checks yet"
                text="Select an official starting point or check a portal address."
              />
            </section>
          )}
        </>
      )}
      {tab === "tasks" && (
        <>
          <div className="toolbar">
            <h2>Saved document checklists</h2>
            <select
              aria-label="Filter checklist tasks"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
            >
              <option value="all">All tasks</option>
              <option value="open">Incomplete tasks</option>
              <option value="done">Completed tasks</option>
            </select>
          </div>
          {lists.map((p) => {
            if (p.payload.kind !== "checklist") return null;
            const list = p.payload;
            const done = list.items.filter((x) => x.done).length;
            const shown = list.items.filter(
              (x) =>
                taskFilter === "all" ||
                (taskFilter === "done" ? x.done : !x.done),
            );
            return (
              <section className="panel" key={p.id}>
                <div className="panel-heading">
                  <div>
                    <h2>{list.title}</h2>
                    <p>
                      {done} of {list.items.length} tasks complete
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setReminder({
                        id: p.id,
                        title: `Document tasks: ${list.title}`,
                      })
                    }
                  >
                    <Icon name="plus" size={15} /> Schedule reminder
                  </button>
                </div>
                <progress
                  className="checklist-progress"
                  aria-label={`${list.title} progress`}
                  value={done}
                  max={list.items.length || 1}
                />
                {shown.map((item) => (
                  <div
                    className={`checklist-task ${item.done ? "task-done" : ""}`}
                    key={item.id}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={busy}
                        onChange={() => toggle(p.id, item.id)}
                      />
                      <span>{item.text}</span>
                    </label>
                    <details>
                      <summary>Source evidence</summary>
                      <blockquote>{item.quote}</blockquote>
                      <SourceLink url={item.sourceUrl} />
                    </details>
                  </div>
                ))}
                {!shown.length && (
                  <Empty
                    title="No tasks in this view"
                    text="Try a different task filter."
                  />
                )}
              </section>
            );
          })}
          {!lists.length && (
            <section className="panel">
              <Empty
                title="Your checklists will live here"
                text="Check an official source, then approve its sourced checklist in Approval desk."
              />
            </section>
          )}
          <section className="panel">
            <h2>AidScout reminders</h2>
            {s.proposals
              .filter(
                (p) =>
                  p.payload.kind === "calendar_event" &&
                  s.runs.find((r) => r.id === p.runId)?.kind === "aidscout",
              )
              .map(
                (p) =>
                  p.payload.kind === "calendar_event" && (
                    <div className="reminder-row" key={p.id}>
                      <div>
                        <b>{p.payload.slot.title}</b>
                        <small>{when(p.payload.slot.start)}</small>
                        <p>{p.reason}</p>
                      </div>
                      <span
                        className={`badge ${p.status === "executed" ? "green" : "neutral"}`}
                      >
                        {p.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  ),
              )}
            {!s.proposals.some(
              (p) =>
                p.payload.kind === "calendar_event" &&
                s.runs.find((r) => r.id === p.runId)?.kind === "aidscout",
            ) && (
              <Empty
                title="No reminders yet"
                text="Schedule a document task reminder from a saved checklist."
              />
            )}
          </section>
        </>
      )}
      {reminder && (
        <ReminderForm
          list={reminder}
          onClose={() => setReminder(null)}
          onStaged={() => {
            setReminder(null);
            onApprovals();
          }}
        />
      )}
    </>
  );
}
function ReminderForm({
  list,
  onClose,
  onStaged,
}: {
  list: { id: string; title: string };
  onClose: () => void;
  onStaged: () => void;
}) {
  const [title, setTitle] = useState(list.title.slice(0, 160)),
    [at, setAt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Schedule a checklist reminder" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              "/api/reminders/stage",
              { checklistId: list.id, title, at: istTime(at) },
              "Reminder staged. Review and approve it to add it to your calendar.",
            );
            onStaged();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="info-banner">
          This is your chosen task reminder, not an official application
          deadline. It will wait for your approval.
        </p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <label className="form-field">
            Title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="form-field">
            Remind me at (IST)
            <input
              required
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </label>
          <div className="editor-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button">
              {busy ? "Staging…" : "Stage reminder for approval"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
