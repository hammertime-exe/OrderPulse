import Icon from "./Icon.tsx";
import { useState } from "react";
import type { State, StockItem } from "../../shared/types.ts";
import { freeStock } from "../../shared/clash.ts";
import { api, Empty, Modal } from "./ui.tsx";
export default function InventoryWorkspace({
  s,
  onSetup,
}: {
  s: State;
  onSetup: () => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<StockItem | null>(null);
  const rows = s.stock.map((x) => ({ ...x, ...freeStock(x.item, s) }));
  const visible = rows.filter(
    (x) =>
      x.item.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "short" ? x.free < 0 : x.free <= 0)),
  );
  return (
    <>
      <div className="toolbar">
        <label className="search-field">
          <span>
            <Icon name="search" />
          </span>
          <input
            aria-label="Search materials"
            placeholder="Find a material…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="action-group">
          <select
            aria-label="Filter stock"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All materials</option>
            <option value="empty">No free stock</option>
            <option value="short">Overcommitted</option>
          </select>
          <button className="secondary-button" onClick={onSetup}>
            Manage materials & recipes <Icon name="arrow" size={15} />
          </button>
        </div>
      </div>
      <p className="info-banner">
        Free stock = on hand − material commitments for confirmed orders.
        Marking an order delivered deducts consumed materials from on-hand
        stock.
      </p>
      <div className="inventory-grid">
        {visible.map((x) => (
          <section className="panel material-card" key={x.item}>
            <div className="material-icon">
              <Icon name="inventory" />
            </div>
            <span className={`badge ${x.free > 0 ? "green" : "amber"}`}>
              {x.free < 0
                ? "Overcommitted"
                : x.free === 0
                  ? "No free stock"
                  : "Available"}
            </span>
            <h2 className="capitalize">{x.item}</h2>
            <div className="stock-quantity">
              {Math.max(0, x.free).toLocaleString("en-IN")}{" "}
              <small>{x.unit}</small>
            </div>
            <p>Free for new orders</p>
            <div className="stock-breakdown">
              <span>
                On hand{" "}
                <b>
                  {x.onHand.toLocaleString("en-IN")} {x.unit}
                </b>
              </span>
              <span>
                Committed{" "}
                <b>
                  {x.committed.toLocaleString("en-IN")} {x.unit}
                </b>
              </span>
            </div>
            {x.free < 0 && (
              <p className="review-note">
                Restock at least {Math.abs(x.free).toLocaleString("en-IN")}{" "}
                {x.unit} for existing commitments.
              </p>
            )}
            <button
              className="secondary-button"
              onClick={() =>
                setSelected({ item: x.item, unit: x.unit, onHand: x.onHand })
              }
            >
              Adjust stock
            </button>
          </section>
        ))}
      </div>
      {!visible.length && (
        <Empty
          title="No matching materials"
          text="Try a different search or stock filter."
        />
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Product requirements</h2>
          <span className="count-label">Per selling unit</span>
        </div>
        <div className="recipe-grid">
          {Object.entries(s.recipes).map(([name, r]) => (
            <div className="recipe-card" key={name}>
              <h3>{name}</h3>
              <p>
                {r.prepHours} preparation hours per order · material amounts per{" "}
                {r.unit}
              </p>
              {Object.entries(r.materials).map(([item, amount]) => (
                <div className="recipe-line" key={item}>
                  <span>{item}</span>
                  <b>
                    {amount} {s.stock.find((x) => x.item === item)?.unit}
                  </b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      {selected && (
        <StockEditor item={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
function StockEditor({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(item.onHand),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={`Adjust ${item.item}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              "/api/stock/adjust",
              {
                item: item.item,
                onHand: amount,
                expectedOnHand: item.onHand,
                reason,
              },
              "Stock updated and recorded in History.",
            );
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="info-banner">
          Enter the new total on hand, rather than the amount to add. Current
          total: {item.onHand} {item.unit}.
        </p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <label className="form-field">
            New on-hand quantity ({item.unit})
            <input
              required
              type="number"
              min="0"
              max="1000000"
              step="any"
              value={Number.isNaN(amount) ? "" : amount}
              onChange={(e) => setAmount(e.target.valueAsNumber)}
            />
          </label>
          <label className="form-field">
            Reason
            <input
              required
              maxLength={250}
              placeholder="Restock, stock count correction…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
              {busy ? "Saving…" : "Save stock adjustment"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
