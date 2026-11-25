import { useState } from "react";
import type { Proposal, State } from "../../shared/types.ts";
const localTime = (value: string) =>
  new Date(Date.parse(value) + 5.5 * 3_600_000).toISOString().slice(0, 16);
const withOffset = (value: string) => (value ? `${value}:00+05:30` : "");

export default function ProposalEditor({
  p,
  s,
  onSaved,
  onCancel,
}: {
  p: Proposal;
  s: State;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(p.payload));
  const [original] = useState(() => structuredClone(p.payload));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/proposals/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          payload: draft,
          expectedPayload: original,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="proposal-editor" onSubmit={save}>
      <div className="editor-heading">
        <b>Edit draft</b>
        <span className="badge violet">Not yet applied</span>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {draft.kind === "customer_reply" && (
          <>
            <label className="form-field">
              To
              <input readOnly value={draft.to} />
            </label>
            <label className="form-field">
              Subject
              <input
                required
                maxLength={250}
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
              />
            </label>
            <label className="form-field">
              Message
              <textarea
                required
                rows={9}
                maxLength={10000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            <p className="field-help">
              Check the product, quantity and pickup against the order above.
              Approved replies stay in the demo outbox.
            </p>
          </>
        )}
        {draft.kind === "sheet_row" && (
          <>
            <div className="product-fields">
              <label className="form-field">
                Customer
                <input
                  required
                  maxLength={160}
                  value={draft.order.customer}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      order: { ...draft.order, customer: e.target.value },
                    })
                  }
                />
              </label>
              <label className="form-field">
                Product
                <select
                  value={draft.order.product}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      order: { ...draft.order, product: e.target.value },
                    })
                  }
                >
                  {Object.entries(s.recipes).map(([name, r]) => (
                    <option key={name} value={name}>
                      {name} ({r.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Quantity ({s.recipes[draft.order.product]?.unit})
                <input
                  required
                  type="number"
                  min="0.001"
                  max="1000000"
                  step="any"
                  value={
                    Number.isNaN(draft.order.quantity)
                      ? ""
                      : draft.order.quantity
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      order: {
                        ...draft.order,
                        quantity: e.target.valueAsNumber,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label className="form-field">
              Pickup (IST)
              <input
                required
                type="datetime-local"
                value={localTime(draft.order.pickupAt)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    order: {
                      ...draft.order,
                      pickupAt: withOffset(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="form-field">
              Customisation
              <textarea
                rows={3}
                maxLength={2000}
                value={draft.order.customization}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    order: { ...draft.order, customization: e.target.value },
                  })
                }
              />
            </label>
            <p className="field-help">
              Saving rechecks stock and scheduling, updates linked time slots,
              and asks you to review the customer reply. No order is committed.
            </p>
          </>
        )}
        {draft.kind === "calendar_event" && (
          <>
            <label className="form-field">
              Title
              <input
                required
                maxLength={160}
                value={draft.slot.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    slot: { ...draft.slot, title: e.target.value },
                  })
                }
              />
            </label>
            <div className="product-fields">
              <label className="form-field">
                Start (IST)
                <input
                  required
                  type="datetime-local"
                  value={localTime(draft.slot.start)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      slot: {
                        ...draft.slot,
                        start: withOffset(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="form-field">
                End (IST)
                <input
                  required
                  type="datetime-local"
                  value={localTime(draft.slot.end)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      slot: { ...draft.slot, end: withOffset(e.target.value) },
                    })
                  }
                />
              </label>
            </div>
          </>
        )}
        <div className="editor-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            {busy ? "Checking & saving…" : "Save draft"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
