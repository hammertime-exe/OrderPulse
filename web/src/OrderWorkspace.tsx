import Icon from "./Icon.tsx";
import { useState } from "react";
import type {
  ClashReport,
  Order,
  OrderRequest,
  State,
} from "../../shared/types.ts";
import { freeStock } from "../../shared/clash.ts";
import {
  api,
  Empty,
  istTime,
  localTime,
  Modal,
  SourceLink,
  when,
} from "./ui.tsx";

export default function OrderWorkspace({
  s,
  onApprovals,
  onRun,
}: {
  s: State;
  onApprovals: () => void;
  onRun: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Order | "new" | null>(null);
  const [delivering, setDelivering] = useState(false),
    [busy, setBusy] = useState(false);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState("all");
  const orders = s.orders
    .filter(
      (o) =>
        (status === "all" || o.status === status) &&
        `${o.customer} ${o.product} ${o.id}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const order = s.orders.find((o) => o.id === selected);
  const message = s.inbox.find((m) => m.id === messageId);
  const run =
    message && s.runs.find((r) => r.input === message.id && r.kind === "order");
  const draft =
    run &&
    s.proposals.find(
      (p) => p.runId === run.id && p.payload.kind === "sheet_row",
    );
  const request =
    run?.request ??
    (draft?.payload.kind === "sheet_row" ? draft.payload.order : undefined);
  const locked = s.runs.some((r) => r.status === "running");
  const deliver = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await api(
        "/api/orders/deliver",
        { id: order.id, expectedOrder: order },
        "Order marked delivered. Materials deducted from stock.",
      );
      setDelivering(false);
      setSelected(null);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="toolbar">
        <label className="search-field">
          <span>
            <Icon name="search" />
          </span>
          <input
            aria-label="Search orders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, products or order IDs…"
          />
        </label>
        <div className="action-group">
          <div className="segmented">
            {["all", "confirmed", "delivered"].map((x) => (
              <button
                key={x}
                aria-pressed={status === x}
                onClick={() => setStatus(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <button
            className="primary-button"
            disabled={locked}
            onClick={() => setEditing("new")}
          >
            <Icon name="plus" size={15} /> New order
          </button>
        </div>
      </div>
      <section className="panel table-panel">
        <div className="panel-heading">
          <h2>
            Order tracker <span className="count-label">{orders.length}</span>
          </h2>
          <button className="text-button" onClick={onApprovals}>
            Review pending changes <Icon name="arrow" size={15} />
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer / Order</th>
                <th>Product</th>
                <th>Pickup (IST)</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{o.customer}</b>
                    <small>{o.id}</small>
                  </td>
                  <td>
                    {o.quantity} {s.recipes[o.product]?.unit} · {o.product}
                  </td>
                  <td>{when(o.pickupAt)}</td>
                  <td>
                    <span
                      className={`badge ${o.status === "confirmed" ? "green" : "neutral"}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(o.id);
                        setDelivering(false);
                      }}
                    >
                      Open order <Icon name="arrow" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!orders.length && (
          <Empty
            title="No matching orders"
            text="Change your filters or create an order draft."
          />
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Order inbox</h2>
            <p>
              Open a request to compare its message with the agent’s findings.
            </p>
          </div>
          <select
            aria-label="Filter inbox"
            value={inboxFilter}
            onChange={(e) => setInboxFilter(e.target.value)}
          >
            <option value="all">All messages</option>
            <option value="unread">Unread only</option>
          </select>
        </div>
        {s.inbox
          .filter((m) => inboxFilter !== "unread" || !m.read)
          .map((m) => (
            <button
              className="inbox-card"
              key={m.id}
              onClick={() => setMessageId(m.id)}
            >
              <span className="customer-avatar">{m.from[0]}</span>
              <span className="message-copy">
                <b>{m.subject}</b>
                <small>
                  {m.from.split("<")[0]} · {when(m.receivedAt)}
                </small>
              </span>
              <span className={`badge ${m.read ? "neutral" : "blue"}`}>
                {m.read ? "Reviewed" : "New"}
              </span>
              <span>
                <Icon name="arrow" />
              </span>
            </button>
          ))}
        {!s.inbox.some((m) => inboxFilter !== "unread" || !m.read) && (
          <Empty
            title="Inbox is clear"
            text="New incoming requests will appear here."
          />
        )}
      </section>
      {message && (
        <Modal
          title="Order review workspace"
          onClose={() => setMessageId(null)}
        >
          <div className="review-workspace">
            <section>
              <span className="eyebrow">ORIGINAL REQUEST</span>
              <h3>{message.subject}</h3>
              <p className="field-help">
                {message.from} · {when(message.receivedAt)}
              </p>
              <p className="original-message">{message.body}</p>
              <SourceLink
                url={`/mock/inbox.html?id=${encodeURIComponent(message.id)}`}
              >
                Open source message
              </SourceLink>
            </section>
            <section>
              <span className="eyebrow">EXTRACTED DETAILS & EVIDENCE</span>
              {request ? (
                <>
                  <dl className="facts-grid">
                    <dt>Customer</dt>
                    <dd>{request.customer}</dd>
                    <dt>Product</dt>
                    <dd>{request.product ?? "Needs clarification"}</dd>
                    <dt>Quantity</dt>
                    <dd>
                      {request.quantity ?? "Not stated"}{" "}
                      {request.product && s.recipes[request.product]?.unit}
                    </dd>
                    <dt>Pickup</dt>
                    <dd>
                      {request.pickupAt
                        ? when(request.pickupAt)
                        : "Needs clarification"}
                    </dd>
                    <dt>Customisation</dt>
                    <dd>{request.customization || "None stated"}</dd>
                  </dl>
                  <MaterialEvidence
                    s={s}
                    request={request}
                    excludeOrderId={
                      draft?.payload.kind === "sheet_row"
                        ? draft.payload.order.id
                        : undefined
                    }
                  />
                  <ConflictEvidence report={run?.report} s={s} />
                  <button
                    className="primary-button"
                    onClick={() => {
                      setMessageId(null);
                      onApprovals();
                    }}
                  >
                    Review proposed changes <Icon name="arrow" size={15} />
                  </button>
                </>
              ) : (
                <Empty
                  title={
                    run?.status === "failed"
                      ? "The agent could not complete this check"
                      : "This request has not been checked"
                  }
                  text={
                    run?.error ??
                    "Run a check to extract details and compare stock and calendar evidence."
                  }
                />
              )}
              {!message.read && (
                <button
                  className="secondary-button"
                  disabled={
                    locked ||
                    s.proposals.some((p) => p.status === "pending_approval")
                  }
                  onClick={() => {
                    onRun(message.id);
                    setMessageId(null);
                  }}
                >
                  Check this request
                </button>
              )}
            </section>
          </div>
        </Modal>
      )}
      {order && !editing && (
        <Modal title={`Order ${order.id}`} onClose={() => setSelected(null)}>
          <h3>{order.customer}</h3>
          <dl className="facts-grid">
            <dt>Product</dt>
            <dd>
              {order.quantity} {s.recipes[order.product]?.unit} {order.product}
            </dd>
            <dt>Pickup</dt>
            <dd>{when(order.pickupAt)}</dd>
            <dt>Customisation</dt>
            <dd>{order.customization || "None"}</dd>
            <dt>Status</dt>
            <dd>{order.status}</dd>
          </dl>
          <MaterialEvidence s={s} request={order} excludeOrderId={order.id} />
          <div className="event-list">
            {s.calendar
              .filter((c) => c.orderId === order.id)
              .map((c) => (
                <p key={c.id}>
                  <span className="badge violet">{c.kind}</span> {c.title}
                  <small>
                    {when(c.start)} – {when(c.end)}
                  </small>
                </p>
              ))}
          </div>
          {order.status === "confirmed" && (
            <div className="action-group">
              <button
                className="secondary-button"
                disabled={locked}
                onClick={() => setEditing(structuredClone(order))}
              >
                Edit order
              </button>
              <button
                className="primary-button"
                disabled={locked || busy}
                onClick={() => setDelivering(true)}
              >
                Mark delivered
              </button>
            </div>
          )}
          {delivering && (
            <div className="confirmation-box">
              <b>Complete this order?</b>
              <p>
                This records delivery and deducts the materials shown above from
                on-hand stock. Check that quantities are correct.
              </p>
              <div className="action-group">
                <button
                  disabled={busy}
                  className="secondary-button"
                  onClick={() => setDelivering(false)}
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  className="primary-button"
                  onClick={deliver}
                >
                  {busy ? "Saving…" : "Confirm delivery & deduct stock"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {editing && (
        <OrderForm
          key={editing === "new" ? "new" : editing.id}
          s={s}
          order={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onStaged={() => {
            setEditing(null);
            setSelected(null);
            onApprovals();
          }}
        />
      )}
    </>
  );
}
function OrderForm({
  s,
  order,
  onClose,
  onStaged,
}: {
  s: State;
  order?: Order;
  onClose: () => void;
  onStaged: () => void;
}) {
  const [customer, setCustomer] = useState(order?.customer ?? ""),
    [product, setProduct] = useState(
      order?.product ?? Object.keys(s.recipes)[0] ?? "",
    );
  const [quantity, setQuantity] = useState(order?.quantity ?? 1),
    [pickup, setPickup] = useState(order ? localTime(order.pickupAt) : "");
  const [customization, setCustomization] = useState(
      order?.customization ?? "",
    ),
    [report, setReport] = useState<ClashReport | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const body = {
    order: {
      customer,
      product,
      quantity,
      pickupAt: pickup ? istTime(pickup) : "",
      customization,
    },
    orderId: order?.id,
    expectedOrder: order,
  };
  const change = () => {
    setReport(null);
    setError("");
  };
  const act = async (stage: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = await api(
        stage ? "/api/orders/stage" : "/api/orders/preview",
        body,
        stage ? "Order and calendar changes staged for approval." : undefined,
      );
      if (stage) onStaged();
      else setReport(result.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={order ? "Revise order" : "Create order draft"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(false);
        }}
      >
        <p className="info-banner">
          Check the plan, then stage it for explicit approval. Existing orders
          stay unchanged until approval.
        </p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <div className="product-fields">
            <label className="form-field">
              Customer
              <input
                required
                maxLength={160}
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  change();
                }}
              />
            </label>
            <label className="form-field">
              Product
              <select
                required
                value={product}
                onChange={(e) => {
                  setProduct(e.target.value);
                  change();
                }}
              >
                {Object.entries(s.recipes).map(([name, recipe]) => (
                  <option value={name} key={name}>
                    {name} ({recipe.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Quantity ({s.recipes[product]?.unit})
              <input
                required
                type="number"
                min="0.001"
                max="1000000"
                step="any"
                value={Number.isNaN(quantity) ? "" : quantity}
                onChange={(e) => {
                  setQuantity(e.target.valueAsNumber);
                  change();
                }}
              />
            </label>
          </div>
          <label className="form-field">
            Pickup (IST)
            <input
              required
              type="datetime-local"
              value={pickup}
              onChange={(e) => {
                setPickup(e.target.value);
                change();
              }}
            />
          </label>
          <label className="form-field">
            Customisation
            <textarea
              maxLength={2000}
              rows={3}
              value={customization}
              onChange={(e) => {
                setCustomization(e.target.value);
                change();
              }}
            />
          </label>
          <MaterialEvidence
            s={s}
            request={{ product, quantity }}
            excludeOrderId={order?.id}
          />
          {report && (
            <>
              <ConflictEvidence report={report} s={s} />
              {report.alternative && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setPickup(localTime(report.alternative!.pickupAt));
                    change();
                  }}
                >
                  Use suggested pickup: {when(report.alternative.pickupAt)}
                </button>
              )}
            </>
          )}
          <div className="editor-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="secondary-button">
              {busy ? "Checking…" : "Check stock & schedule"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!report || report.clashes.length > 0 || busy}
              onClick={() => act(true)}
            >
              Stage for approval
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function MaterialEvidence({
  s,
  request,
  excludeOrderId,
}: {
  s: State;
  request: { product: string | null; quantity: number | null };
  excludeOrderId?: string;
}) {
  const recipe = request.product ? s.recipes[request.product] : undefined;
  if (!recipe || !request.quantity) return null;
  const context = {
    ...s,
    orders: s.orders.filter((o) => o.id !== excludeOrderId),
  };
  return (
    <div className="evidence-section">
      <h3>Material requirements · current stock</h3>
      <div className="table-scroll">
        <table className="data-table compact-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Needed</th>
              <th>Free stock</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(recipe.materials).map(([item, amount]) => {
              const { free, stock } = freeStock(item, context),
                need = amount * request.quantity!;
              return (
                <tr key={item}>
                  <td>{item}</td>
                  <td>
                    {need.toLocaleString("en-IN")} {stock?.unit}
                  </td>
                  <td>
                    {Math.max(free, 0).toLocaleString("en-IN")} {stock?.unit}
                  </td>
                  <td>
                    <span
                      className={`badge ${need <= free ? "green" : "amber"}`}
                    >
                      {need <= free
                        ? "Enough"
                        : `Short ${(need - Math.max(0, free)).toLocaleString("en-IN")}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SourceLink url="/mock/tracker.html">
        View stock and order source
      </SourceLink>
    </div>
  );
}
export function ConflictEvidence({
  report,
  s,
}: {
  report?: ClashReport;
  s: State;
}) {
  if (!report) return null;
  return (
    <div className="evidence-section">
      <h3>Schedule & conflict check</h3>
      {report.clashes.length ? (
        report.clashes.map((c, i) => (
          <div className="conflict-item" key={i}>
            <span className="badge amber">{c.kind}</span>
            <p>{c.message}</p>
            {c.evidence && (
              <small>
                {s.calendar.find((slot) => slot.id === c.evidence)?.title ??
                  c.evidence}
              </small>
            )}
          </div>
        ))
      ) : (
        <p className="success-banner">Stock and schedule checks passed.</p>
      )}
      {report.prep && (
        <p className="field-help">
          Preparation: {when(report.prep.start)} – {when(report.prep.end)}
        </p>
      )}
      {report.alternative && (
        <p className="field-help">
          Suggested pickup: {when(report.alternative.pickupAt)}. Material
          shortages still need resolving.
        </p>
      )}
      <SourceLink url="/mock/calendar.html">
        View production calendar source
      </SourceLink>
    </div>
  );
}
