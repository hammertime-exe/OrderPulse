import Icon from "./Icon.tsx";
import { useEffect, useState } from "react";
import type {
  BusinessProfile,
  Recipe,
  State,
  StockItem,
} from "../../shared/types.ts";

type Product = Recipe & { name: string };
const categories = [
  ["baker", "Baking", "Cakes, desserts & baked goods"],
  ["tailor", "Tailoring", "Garments, alterations & stitching"],
  ["crafter", "Crafts", "Handmade & personalised products"],
  ["caterer", "Catering", "Meal orders & event preparation"],
  ["other", "Other", "Your own custom-order business"],
] as const;
const templates = {
  baker: {
    name: "custom cupcakes",
    unit: "box",
    prepHours: 2,
    material: "cupcake mix",
    materialUnit: "g",
    amount: 500,
  },
  tailor: {
    name: "custom kurta",
    unit: "piece",
    prepHours: 3,
    material: "cotton fabric",
    materialUnit: "m",
    amount: 2.5,
  },
  crafter: {
    name: "personalised candle",
    unit: "piece",
    prepHours: 2,
    material: "soy wax",
    materialUnit: "g",
    amount: 200,
  },
  caterer: {
    name: "meal tray",
    unit: "tray",
    prepHours: 3,
    material: "rice",
    materialUnit: "g",
    amount: 500,
  },
  other: {
    name: "custom product",
    unit: "piece",
    prepHours: 1,
    material: "raw material",
    materialUnit: "unit",
    amount: 1,
  },
};

export default function WorkspaceSetup({
  s,
  onDirtyChange,
}: {
  s: State;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(s.business?.name ?? "Seller workspace");
  const [category, setCategory] = useState<BusinessProfile["category"]>(
    s.business?.category ?? "baker",
  );
  const [stock, setStock] = useState<StockItem[]>(() =>
    structuredClone(s.stock),
  );
  const [products, setProducts] = useState<Product[]>(() =>
    Object.entries(s.recipes).map(([name, r]) => ({
      name,
      ...structuredClone(r),
    })),
  );
  const [baseline, setBaseline] = useState(() =>
    structuredClone({ business: s.business, stock: s.stock, recipes: s.recipes }),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const locked =
    s.runs.some((r) => r.status === "running") ||
    s.proposals.some((p) => p.status === "pending_approval");
  const change = () => {
    setDirty(true);
    setMessage("");
  };
  const updateStock = (i: number, patch: Partial<StockItem>) => {
    change();
    setStock((items) =>
      items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    );
  };
  const updateProduct = (i: number, patch: Partial<Product>) => {
    change();
    setProducts((items) =>
      items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    );
  };
  const load = async () => {
    if (
      dirty &&
      !confirm("Discard unsaved business settings and load the saved version?")
    )
      return;
    try {
      const r = await fetch("/api/state");
      if (!r.ok) throw new Error("Could not load settings.");
      const current: State = await r.json();
      setName(current.business?.name ?? "Seller workspace");
      setCategory(current.business?.category ?? "baker");
      setStock(structuredClone(current.stock));
      setProducts(
        Object.entries(current.recipes).map(([name, r]) => ({ name, ...r })),
      );
      setBaseline({
        business: current.business,
        stock: current.stock,
        recipes: current.recipes,
      });
      setDirty(false);
      setMessage("Loaded saved settings.");
      setFailed(false);
    } catch (e) {
      setMessage(String(e));
      setFailed(true);
    }
  };
  const sample = () => {
    const t = templates[category];
    if (products.some((p) => p.name === t.name)) {
      setFailed(true);
      setMessage("This sample product is already in your catalog.");
      return;
    }
    const material = stock.find((x) => x.item === t.material);
    if (material && material.unit !== t.materialUnit) {
      setFailed(true);
      setMessage(
        "The sample material uses a different unit. Add a product manually with your recorded unit.",
      );
      return;
    }
    if (!material)
      setStock([
        ...stock,
        { item: t.material, unit: t.materialUnit, onHand: 0 },
      ]);
    setProducts([
      ...products,
      {
        name: t.name,
        unit: t.unit,
        prepHours: t.prepHours,
        materials: { [t.material]: t.amount },
      },
    ]);
    change();
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const names = products.map((p) => p.name.trim());
      if (new Set(names).size !== names.length)
        throw new Error("Product names must be unique.");
      const recipes = Object.fromEntries(
        products.map(({ name, ...recipe }) => [name.trim(), recipe]),
      );
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business: { name, category },
          stock,
          recipes,
          expected: baseline,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setBaseline(data.settings);
      setDirty(false);
      setMessage(
        "Business settings saved. Your catalog is ready for order checks.",
      );
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="setup-form">
      <div className="setup-intro">
        <div>
          <span className="eyebrow">BUILT AROUND YOUR BUSINESS</span>
          <h2>Make this workspace yours.</h2>
          <p>
            Set your business type, products and materials. Existing orders stay
            in place.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={load}
        >
          Reload saved settings
        </button>
      </div>
      {locked && (
        <p className="info-banner">
          Resolve pending approvals and finish any active agent run before
          saving settings.
        </p>
      )}
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "error-banner" : "success-banner"}
        >
          {message}
        </p>
      )}
      <fieldset disabled={busy || locked}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Business profile</h2>
              <p>A familiar name and the right starting point</p>
            </div>
            <span className="step-label">01</span>
          </div>
          <label className="form-field">
            Business name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                change();
              }}
              placeholder="Your business name"
            />
          </label>
          <p className="field-title">What do you create?</p>
          <div className="category-grid">
            {categories.map(([key, title, detail]) => (
              <label
                className={`category-option ${category === key ? "selected" : ""}`}
                key={key}
              >
                <input
                  type="radio"
                  name="category"
                  value={key}
                  checked={category === key}
                  onChange={() => {
                    setCategory(key);
                    change();
                  }}
                />
                <b>{title}</b>
                <small>{detail}</small>
              </label>
            ))}
          </div>
          <div className="template-action">
            <p>
              Need a starting point? Add an example product for this business.
              Sample stock starts at zero.
            </p>
            <button type="button" className="secondary-button" onClick={sample}>
              Add sample product <Icon name="arrow" size={15} />
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Materials & stock</h2>
              <p>Use the same units in stock and product requirements.</p>
            </div>
            <span className="step-label">02</span>
          </div>
          <div className="stock-editor">
            {stock.map((x, i) => {
              const used = Object.values(s.recipes).some((r) =>
                Object.hasOwn(r.materials, x.item),
              );
              return (
                <div className="stock-edit-row" key={i}>
                  <label className="form-field">
                    Material
                    <input
                      required
                      readOnly={used}
                      value={x.item}
                      onChange={(e) => updateStock(i, { item: e.target.value })}
                      maxLength={160}
                    />
                  </label>
                  <label className="form-field">
                    Unit
                    <input
                      required
                      readOnly={used}
                      value={x.unit}
                      onChange={(e) => updateStock(i, { unit: e.target.value })}
                      maxLength={24}
                      placeholder="g, m, pieces…"
                    />
                  </label>
                  <label className="form-field">
                    On hand
                    <input
                      required
                      type="number"
                      min="0"
                      max="1000000"
                      step="any"
                      value={Number.isNaN(x.onHand) ? "" : x.onHand}
                      onChange={(e) =>
                        updateStock(i, { onHand: e.target.valueAsNumber })
                      }
                    />
                  </label>
                  {!s.stock.some((old) => old.item === x.item) && (
                    <button
                      type="button"
                      className="remove-button"
                      aria-label={`Remove material ${x.item || i + 1}`}
                      onClick={() => {
                        setStock(stock.filter((_, j) => i !== j));
                        change();
                      }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setStock([...stock, { item: "", unit: "", onHand: 0 }]);
              change();
            }}
          >
            <Icon name="plus" size={15} /> Add material
          </button>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Products & preparation</h2>
              <p>
                Material amounts are per product unit. Preparation time is per
                order.
              </p>
            </div>
            <span className="step-label">03</span>
          </div>
          <div className="product-editors">
            {products.map((p, i) => {
              const used = s.orders.some((o) => o.product === p.name);
              return (
                <section className="product-editor" key={i}>
                  <div className="product-editor-heading">
                    <b>Product {i + 1}</b>
                    {used ? (
                      <span className="badge neutral">
                        Used by existing orders
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="remove-button"
                        aria-label={`Remove product ${p.name || i + 1}`}
                        onClick={() => {
                          setProducts(products.filter((_, j) => i !== j));
                          change();
                        }}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                  <fieldset disabled={used}>
                    <div className="product-fields">
                      <label className="form-field">
                        Product name
                        <input
                          required
                          value={p.name}
                          maxLength={160}
                          onChange={(e) =>
                            updateProduct(i, { name: e.target.value })
                          }
                        />
                      </label>
                      <label className="form-field">
                        Selling unit
                        <input
                          required
                          value={p.unit}
                          maxLength={24}
                          onChange={(e) =>
                            updateProduct(i, { unit: e.target.value })
                          }
                          placeholder="kg, piece, tray…"
                        />
                      </label>
                      <label className="form-field">
                        Preparation hours
                        <input
                          required
                          type="number"
                          min="0.25"
                          max="13"
                          step="0.25"
                          value={Number.isNaN(p.prepHours) ? "" : p.prepHours}
                          onChange={(e) =>
                            updateProduct(i, {
                              prepHours: e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="materials-editor">
                      {Object.entries(p.materials).map(([item, amount], mi) => (
                        <div className="material-edit-row" key={mi}>
                          <label className="form-field">
                            Material
                            <select
                              required
                              value={item}
                              onChange={(e) => {
                                const entries = Object.entries(p.materials);
                                entries[mi] = [e.target.value, amount];
                                updateProduct(i, {
                                  materials: Object.fromEntries(entries),
                                });
                              }}
                            >
                              <option value="">Choose material</option>
                              {stock
                                .filter(
                                  (x) =>
                                    x.item.trim() &&
                                    (x.item === item ||
                                      !Object.hasOwn(p.materials, x.item)),
                                )
                                .map((x) => (
                                  <option key={x.item} value={x.item}>
                                    {x.item} ({x.unit})
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="form-field">
                            Amount per {p.unit || "unit"}
                            <input
                              required
                              type="number"
                              min="0.001"
                              max="1000000"
                              step="any"
                              value={Number.isNaN(amount) ? "" : amount}
                              onChange={(e) =>
                                updateProduct(i, {
                                  materials: {
                                    ...p.materials,
                                    [item]: e.target.valueAsNumber,
                                  },
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="remove-button"
                            aria-label={`Remove ${item || "material"} from ${p.name}`}
                            onClick={() => {
                              const materials = { ...p.materials };
                              delete materials[item];
                              updateProduct(i, { materials });
                            }}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      disabled={Object.hasOwn(p.materials, "")}
                      onClick={() =>
                        updateProduct(i, {
                          materials: { ...p.materials, "": 1 },
                        })
                      }
                    >
                      <Icon name="plus" size={15} /> Add material requirement
                    </button>
                  </fieldset>
                  {used && (
                    <p className="field-help">
                      This recipe is part of an existing order. Add a new
                      product to use different requirements.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setProducts([
                ...products,
                { name: "", unit: "", prepHours: 1, materials: {} },
              ]);
              change();
            }}
          >
            <Icon name="plus" size={15} /> Add product
          </button>
        </section>
        <div className="setup-save-bar">
          <span>
            {dirty ? "You have unsaved changes" : "All settings are up to date"}{" "}
            · Times use IST (UTC +05:30)
          </span>
          <button
            className="primary-button"
            disabled={!dirty || busy || locked}
            type="submit"
          >
            {busy ? "Saving…" : "Save business settings"}{" "}
            <span>
              <Icon name="check" />
            </span>
          </button>
        </div>
      </fieldset>
    </form>
  );
}
