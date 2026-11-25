// The one contract every branch codes against. Times are ISO strings with the +05:30 offset.

export type InboxMessage = {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  read: boolean;
};

/** What the AI pulls out of a message. null = not stated; the seller must fill it in. */
export type OrderRequest = {
  sourceMessageId: string;
  customer: string;
  product: string | null; // must match a key of State.recipes
  customization: string;
  quantity: number | null; // in the recipe's unit
  pickupAt: string | null;
  constraints: string[];
};

export type Order = {
  id: string;
  customer: string;
  product: string;
  quantity: number;
  customization: string;
  pickupAt: string;
  status: "confirmed" | "delivered";
  sourceMessageId?: string;
};

export type StockItem = { item: string; unit: string; onHand: number };

export type Recipe = {
  unit: string; // what quantity counts, e.g. "kg"
  prepHours: number; // per order, not per unit
  materials: Record<string, number>; // stock item -> amount per unit
};

export type CalendarSlot = {
  id: string;
  title: string;
  start: string;
  end: string;
  kind: "prep" | "pickup" | "personal" | "reminder";
  orderId?: string;
};

export type Clash = {
  kind: "calendar" | "stock" | "hours" | "missing";
  message: string;
  evidence?: string; // id of the slot/order/stock item or a source URL
};

export type Window = { start: string; end: string };

export type ClashReport = {
  clashes: Clash[];
  prep: Window | null; // prep window for the requested pickup
  alternative: { pickupAt: string; prep: Window } | null; // nearest pickup with a free prep window
};

export type Gate0Label =
  "Official source confirmed" | "Unable to verify" | "Potential lookalike";

export type Gate0Result = {
  url: string;
  finalUrl: string;
  hostname: string;
  label: Gate0Label;
  reasons: string[];
};

export type ChecklistItem = {
  id: string;
  text: string;
  quote: string;
  sourceUrl: string;
  done: boolean;
};

export type ProposalPayload =
  | { kind: "sheet_row"; order: Order; previousOrder?: Order }
  | { kind: "calendar_event"; slot: CalendarSlot }
  | { kind: "customer_reply"; to: string; subject: string; body: string }
  | { kind: "checklist"; title: string; items: ChecklistItem[] };

export type Proposal = {
  id: string;
  runId: string;
  status: "pending_approval" | "approved" | "rejected" | "executed" | "failed";
  payload: ProposalPayload;
  reason: string; // why the agent proposes this, shown in the approval desk
  createdAt: string;
  reviewRequired?: boolean;
};

export type AuditEntry = {
  at: string;
  actor: "agent" | "seller";
  action: string;
  proposalId?: string;
  detail: string;
  source?: string;
};

export type Phase =
  "CHECK" | "VERIFY" | "REASON" | "PREPARE" | "APPROVE" | "EXECUTE";

export type AgentStep = {
  at: string;
  phase: Phase;
  action: string;
  url?: string;
  detail?: string;
};

export type Run = {
  id: string;
  kind: "order" | "aidscout";
  status: "running" | "awaiting_approval" | "done" | "failed";
  input?: string; // aidscout: the URL or question; order: the source message id
  startedAt?: string;
  manual?: boolean;
  request?: OrderRequest;
  steps: AgentStep[];
  proposalIds: string[];
  report?: ClashReport;
  gate0?: Gate0Result[];
  error?: string;
  findings?: {
    checkedAt: string;
    deadline?: { date: string; quote: string; url: string };
  };
  preview?: { dataUrl: string; url: string; at: string };
};

export type SentMessage = {
  at: string;
  to: string;
  subject: string;
  body: string;
  proposalId: string;
};

export type BusinessProfile = {
  name: string;
  category: "baker" | "tailor" | "crafter" | "caterer" | "other";
};

export type State = {
  business?: BusinessProfile;
  version: number;
  inbox: InboxMessage[];
  sent: SentMessage[]; // demo "sent" folder; nothing leaves the app
  orders: Order[];
  stock: StockItem[];
  recipes: Record<string, Recipe>;
  calendar: CalendarSlot[];
  proposals: Proposal[];
  audit: AuditEntry[];
  runs: Run[];
};
