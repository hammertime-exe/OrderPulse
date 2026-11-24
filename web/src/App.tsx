import { useEffect, useState, type ReactNode } from 'react';
import type { Gate0Result, Phase, Proposal, Run, State } from '../../shared/types.ts';

const post = (path: string, body?: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const when = (iso: string) => fmt.format(new Date(iso));

const PHASES: Phase[] = ['CHECK', 'VERIFY', 'REASON', 'PREPARE', 'APPROVE', 'EXECUTE'];
const phaseColor: Record<Phase, string> = {
  CHECK: 'bg-sky-100 text-sky-800', VERIFY: 'bg-violet-100 text-violet-800', REASON: 'bg-amber-100 text-amber-800',
  PREPARE: 'bg-slate-200 text-slate-800', APPROVE: 'bg-emerald-100 text-emerald-800', EXECUTE: 'bg-emerald-200 text-emerald-900',
};
const gateColor: Record<Gate0Result['label'], string> = {
  'Official source confirmed': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Unable to verify': 'bg-amber-100 text-amber-800 border-amber-300',
  'Potential lookalike': 'bg-red-100 text-red-800 border-red-300',
};

const TABS = ['Today', 'Agent activity', 'Approval desk', 'AidScout', 'History'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [s, setS] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>('Today');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/state').then((r) => r.json()).then((x) => alive && (setS(x), setError(''))).catch((e) => alive && setError(String(e)));
    load();
    const t = setInterval(load, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!s) return <main className="p-8">{error ? `Cannot reach the API: ${error}` : 'Loading…'}</main>;
  const pending = s.proposals.filter((p) => p.status === 'pending_approval');
  const start = async (kind: Run['kind'], input?: string) => {
    const r = await post('/api/runs', { kind, input });
    if (r.error) setError(r.error); else setTab('Agent activity');
  };

  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-6">
        <b className="text-lg">OrderPulse</b>
        <nav className="flex gap-1" aria-label="Screens">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined}
              className={`px-3 py-1 rounded ${tab === t ? 'bg-white text-slate-900' : 'hover:bg-slate-700'}`}>
              {t}{t === 'Approval desk' && pending.length ? <span className="ml-1 rounded-full bg-amber-400 text-slate-900 px-1.5 text-xs">{pending.length}</span> : null}
            </button>
          ))}
        </nav>
        <span className="ml-auto text-xs text-slate-400">Demo workspace · synthetic data · nothing is written without your approval</span>
      </header>
      {error && <p role="alert" className="bg-red-100 text-red-800 px-6 py-2">{error}</p>}
      <main className="max-w-6xl mx-auto p-6">
        {tab === 'Today' && <Today s={s} pending={pending} onCheck={() => start('order')} />}
        {tab === 'Agent activity' && <Activity s={s} />}
        {tab === 'Approval desk' && <Desk s={s} pending={pending} />}
        {tab === 'AidScout' && <AidScout s={s} onRun={(url) => start('aidscout', url)} />}
        {tab === 'History' && <History s={s} />}
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="bg-white border border-slate-200 rounded-lg p-4 mb-4"><h2 className="font-semibold mb-2">{title}</h2>{children}</section>;
}

function Today({ s, pending, onCheck }: { s: State; pending: Proposal[]; onCheck: () => void }) {
  const unread = s.inbox.filter((m) => !m.read);
  const pickups = s.orders.filter((o) => o.status === 'confirmed').sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const latest = s.runs.find((r) => r.kind === 'order' && r.report);
  const running = s.runs.some((r) => r.status === 'running');
  return (
    <>
      <div className="flex gap-3 mb-4">
        <button onClick={onCheck} disabled={running} className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50">
          {running ? 'Agent is working…' : 'Check new orders'}
        </button>
        <button onClick={() => confirm('Reset the demo workspace to seeded data?') && post('/api/reset')} className="border rounded px-4 py-2">Reset demo</button>
      </div>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[['New order messages', unread.length], ['Upcoming pickups', pickups.length], ['Flagged conflicts', latest?.report?.clashes.length ?? 0], ['Awaiting approval', pending.length]].map(([k, v]) => (
          <div key={k} className="bg-white border rounded-lg p-4"><div className="text-3xl font-bold">{v}</div><div className="text-slate-500 text-sm">{k}</div></div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Upcoming pickups">
          <ul className="text-sm space-y-1">{pickups.map((o) => <li key={o.id}><b>{when(o.pickupAt)}</b> · {o.id} {o.customer} — {o.quantity} × {o.product}</li>)}</ul>
        </Card>
        <Card title="Flagged conflicts (latest order check)">
          {latest?.report?.clashes.length ? <Clashes run={latest} /> : <p className="text-sm text-slate-500">None yet. Run "Check new orders".</p>}
        </Card>
      </div>
    </>
  );
}

function Clashes({ run }: { run: Run }) {
  const r = run.report!;
  return (
    <ul className="text-sm space-y-1">
      {r.clashes.map((c, i) => <li key={i} className="border-l-4 border-red-400 pl-2"><b className="capitalize">{c.kind}</b>: {c.message}</li>)}
      {r.alternative && <li className="border-l-4 border-emerald-400 pl-2"><b>Nearest feasible pickup</b>: {when(r.alternative.pickupAt)}</li>}
    </ul>
  );
}

function Activity({ s }: { s: State }) {
  const [id, setId] = useState<string>();
  const run = s.runs.find((r) => r.id === id) ?? s.runs[0];
  if (!run) return <p>No agent runs yet.</p>;
  const url = [...run.steps].reverse().find((x) => x.url)?.url;
  const reached = new Set(run.steps.map((x) => x.phase));
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm">Run{' '}
          <select value={run.id} onChange={(e) => setId(e.target.value)} className="border rounded px-2 py-1">
            {s.runs.map((r) => <option key={r.id} value={r.id}>{r.kind} · {r.id} · {r.status}</option>)}
          </select>
        </label>
        <span className={`text-sm px-2 rounded ${run.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}>{run.status}</span>
      </div>
      <div className="flex gap-1 mb-3" aria-label="Progress">
        {PHASES.map((p) => <span key={p} className={`text-xs px-2 py-1 rounded ${reached.has(p) ? phaseColor[p] : 'bg-slate-100 text-slate-400'}`}>{p}</span>)}
      </div>
      <div className="bg-slate-100 border rounded px-3 py-2 font-mono text-sm mb-4 truncate" aria-label="Current page">{url ?? 'about:blank'}</div>
      {run.error && <p role="alert" className="bg-red-100 text-red-800 rounded p-2 mb-3">{run.error}</p>}
      <ol className="space-y-2">
        {run.steps.map((x, i) => (
          <li key={i} className="bg-white border rounded p-3">
            <div className="flex gap-2 items-center text-sm">
              <span className={`text-xs px-2 rounded ${phaseColor[x.phase]}`}>{x.phase}</span>
              <b>{x.action}</b>
              <span className="ml-auto text-slate-400 text-xs">{new Date(x.at).toLocaleTimeString()}</span>
            </div>
            {x.url && <div className="text-xs text-slate-500 font-mono mt-1">{x.url}</div>}
            {x.detail && <pre className="text-sm whitespace-pre-wrap mt-1 font-sans text-slate-700">{x.detail}</pre>}
          </li>
        ))}
      </ol>
      {run.gate0 && <Gate0List results={run.gate0} />}
    </>
  );
}

function Preview({ p }: { p: Proposal }) {
  const x = p.payload;
  switch (x.kind) {
    case 'sheet_row': return (
      <table className="text-sm w-full"><tbody>
        {Object.entries({ ID: x.order.id, Customer: x.order.customer, Product: x.order.product, Qty: x.order.quantity, Customisation: x.order.customization, Pickup: when(x.order.pickupAt) })
          .map(([k, v]) => <tr key={k}><th className="text-left pr-3 text-slate-500 font-normal">{k}</th><td className="text-emerald-800">+ {v}</td></tr>)}
      </tbody></table>);
    case 'calendar_event': return <p className="text-sm text-emerald-800">+ {when(x.slot.start)} – {when(x.slot.end)} · {x.slot.title} <span className="text-slate-500">({x.slot.kind})</span></p>;
    case 'customer_reply': return <div className="text-sm"><div className="text-slate-500">To {x.to} · {x.subject}</div><pre className="whitespace-pre-wrap font-sans bg-slate-50 p-2 rounded mt-1">{x.body}</pre></div>;
    case 'checklist': return <ul className="text-sm list-disc pl-5">{x.items.map((i) => <li key={i.id}>{i.text}</li>)}</ul>;
  }
}

const label: Record<Proposal['payload']['kind'], string> = { sheet_row: 'Order tracker row', calendar_event: 'Calendar event', customer_reply: 'Customer reply (draft)', checklist: 'Checklist' };

function Desk({ s, pending }: { s: State; pending: Proposal[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const act = async (action: 'approve' | 'reject', ids: string[]) => {
    setBusy(true);
    const r = await post(`/api/proposals/${action}`, { ids });
    setBusy(false);
    const failed = (r.results ?? []).filter((x: { ok: boolean }) => !x.ok);
    setMsg(failed.length ? `Not written: ${failed.map((f: { error: string }) => f.error).join('; ')}` : `${ids.length} ${action === 'approve' ? 'approved and written' : 'rejected'}.`);
  };
  const runs = [...new Set(pending.map((p) => p.runId))];
  return (
    <>
      {msg && <p role="status" className="bg-slate-100 rounded p-2 mb-3 text-sm">{msg}</p>}
      {!runs.length && <p className="text-slate-500">Nothing waiting for approval.</p>}
      {runs.map((runId) => {
        const run = s.runs.find((r) => r.id === runId);
        const items = pending.filter((p) => p.runId === runId);
        return (
          <Card key={runId} title={`Staged by ${run?.kind ?? 'agent'} run ${runId}`}>
            {run?.report && <div className="mb-3"><h3 className="text-sm font-semibold text-slate-500 mb-1">Evidence</h3><Clashes run={run} /></div>}
            <div className="space-y-3">
              {items.map((p) => (
                <div key={p.id} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <b className="text-sm">{label[p.payload.kind]}</b>
                    <span className="text-xs text-slate-500">{p.reason}</span>
                    <button disabled={busy} onClick={() => act('reject', [p.id])} className="ml-auto text-sm border rounded px-2 disabled:opacity-50">Reject</button>
                  </div>
                  <Preview p={p} />
                </div>
              ))}
            </div>
            <button disabled={busy} onClick={() => act('approve', items.map((p) => p.id))} className="mt-3 bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50">
              Approve all {items.length} and write
            </button>
          </Card>
        );
      })}
    </>
  );
}

function Gate0List({ results }: { results: Gate0Result[] }) {
  return (
    <div className="space-y-2 my-3">
      {results.map((g, i) => (
        <div key={i} className={`border rounded p-3 ${gateColor[g.label]}`}>
          <div className="font-semibold">{g.label} · <span className="font-mono">{g.hostname || g.url}</span></div>
          <ul className="text-sm list-disc pl-5">{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

const PRESETS = [
  ['Official Udyam portal', 'https://udyamregistration.gov.in/'],
  ['Lookalike test site', 'https://udyamregistration-gov.example/'],
];

function AidScout({ s, onRun }: { s: State; onRun: (url: string) => void }) {
  const [url, setUrl] = useState(PRESETS[0][1]);
  const runs = s.runs.filter((r) => r.kind === 'aidscout');
  const lists = s.proposals.filter((p) => p.payload.kind === 'checklist' && p.status === 'executed');
  return (
    <>
      <Card title="Explore opportunities">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onRun(url); }}>
          <label className="sr-only" htmlFor="aid-url">Portal address</label>
          <input id="aid-url" value={url} onChange={(e) => setUrl(e.target.value)} className="border rounded px-2 py-1 flex-1 font-mono text-sm" />
          <button className="bg-slate-900 text-white rounded px-4">Check with Gate 0</button>
        </form>
        <div className="flex gap-2 mt-2 text-sm">{PRESETS.map(([k, v]) => <button key={v} onClick={() => setUrl(v)} className="underline">{k}</button>)}</div>
        <p className="text-xs text-slate-500 mt-2">Gate 0 is a risk screen, not a security certificate. The agent never fills or submits forms on these sites.</p>
      </Card>
      {runs.slice(0, 3).map((r) => (
        <Card key={r.id} title={`${r.input} · ${r.status}`}>
          {r.gate0 ? <Gate0List results={r.gate0} /> : <p className="text-sm text-slate-500">{r.status === 'running' ? 'Checking…' : r.error}</p>}
        </Card>
      ))}
      {lists.map((p) => p.payload.kind === 'checklist' && (
        <Card key={p.id} title={p.payload.title}>
          <ul className="space-y-2">
            {p.payload.items.map((i) => (
              <li key={i.id} className="text-sm">
                <label className="flex gap-2 items-start">
                  <input type="checkbox" checked={i.done} onChange={() => post('/api/checklist/toggle', { proposalId: p.id, itemId: i.id })} className="mt-1" />
                  <span>{i.text}<span className="block text-xs text-slate-500">“{i.quote}” — <a className="underline" href={i.sourceUrl} target="_blank" rel="noreferrer">{new URL(i.sourceUrl).hostname}</a></span></span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

function History({ s }: { s: State }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <Card title="Audit trail">
          <ol className="text-sm space-y-1">
            {s.audit.map((a, i) => (
              <li key={i} className="border-b pb-1">
                <span className="text-slate-400 text-xs">{when(a.at)}</span> <b>{a.actor}</b> {a.action} — {a.detail}{a.source && <span className="text-slate-500"> ({a.source})</span>}
              </li>
            ))}
          </ol>
          {!s.audit.length && <p className="text-sm text-slate-500">No actions yet.</p>}
        </Card>
      </div>
      <Card title="Sent (demo outbox)">
        {s.sent.map((m, i) => <div key={i} className="text-sm border-b pb-2 mb-2"><b>{m.subject}</b><div className="text-slate-500 text-xs">to {m.to} · {when(m.at)}</div></div>)}
        {!s.sent.length && <p className="text-sm text-slate-500">Nothing sent.</p>}
      </Card>
    </div>
  );
}
