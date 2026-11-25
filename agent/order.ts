import type {
  CalendarSlot,
  Order,
  OrderRequest,
  Proposal,
  Recipe,
  StockItem,
} from "../shared/types.ts";
import { checkOrder, statesQuantity } from "../shared/clash.ts";
import { H, fmt, iso } from "../shared/time.ts";
import { newId, now, updateState, readState } from "../server/store.ts";
import { extractJson } from "./ai.ts";
import { appUrl, launchBrowser } from "./browser.ts";
import { step, capture } from "./steps.ts";

const instructions = (
  products: string[],
  receivedAt: string,
) => `Extract a custom order from a customer's message to a home bakery.
Menu products (use the exact name): ${products.join(", ")}.
The message was received at ${receivedAt} (India time, +05:30). Resolve relative dates like "this Saturday" against it.
Return JSON: {"customer": string, "product": menu product name or null, "customization": string, "quantity": number in kg or null, "pickupAt": ISO 8601 with +05:30 offset or null, "constraints": string[] (allergies, delivery or packaging notes)}.
Use null for anything the message does not clearly state. Never guess.`;

/** Hero demo: read the newest unread order, check tracker and calendar, stage proposals. Never writes on its own. */
export async function run(runId: string, input?: string) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();

    // CHECK: open the inbox and the newest unread message
    await page.goto(appUrl("/mock/inbox.html"));
    await step(runId, "CHECK", "Opened order inbox", { url: page.url() });
    const row = input
      ? page
          .locator(
            `[data-testid=row][data-unread=true][data-id="${input.replace(/[^a-zA-Z0-9_-]/g, "")}"]`,
          )
          .first()
      : page.locator("[data-testid=row][data-unread=true]").first();
    if (!(await row.count())) {
      await step(runId, "CHECK", "No unread messages; nothing to do");
      await updateState((s) => {
        const r = s.runs.find((x) => x.id === runId);
        if (r) r.status = "done";
      });
      return;
    }
    await row.click();
    await page.waitForSelector("[data-testid=message]");
    const msg = {
      id: (await page.getAttribute("[data-testid=message]", "data-id"))!,
      from: await page.innerText("[data-testid=from]"),
      receivedAt: (await page.getAttribute(
        "[data-testid=received]",
        "data-iso",
      ))!,
      body: await page.innerText("[data-testid=body]"),
    };
    await capture(runId, page);
    await step(runId, "CHECK", `Read message ${msg.id} from ${msg.from}`, {
      url: page.url(),
      detail: msg.body,
    });

    // CHECK: order tracker (orders, stock, recipes) and production calendar, read off the pages
    await page.goto(appUrl("/mock/tracker.html"));
    await page.waitForSelector("[data-testid=orders] tbody tr");
    const orders: Order[] = await page.$$eval(
      "[data-testid=orders] tbody tr",
      (trs) =>
        trs.map((tr) => {
          const d = (tr as HTMLElement).dataset,
            td = tr.querySelectorAll("td");
          return {
            id: d.id!,
            customer: td[1].textContent!,
            product: d.product!,
            quantity: Number(d.quantity),
            customization: td[4].textContent!,
            pickupAt: d.pickup!,
            status: d.status as Order["status"],
          };
        }),
    );
    const stock: StockItem[] = await page.$$eval(
      "[data-testid=stock] tbody tr",
      (trs) =>
        trs.map((tr) => ({
          item: (tr as HTMLElement).dataset.item!,
          onHand: Number((tr as HTMLElement).dataset.onHand),
          unit: tr.querySelectorAll("td")[2].textContent!,
        })),
    );
    const recipes: Record<string, Recipe> = Object.fromEntries(
      await page.$$eval("[data-testid=recipes] tbody tr", (trs) =>
        trs.map((tr) => [
          (tr as HTMLElement).dataset.product!,
          JSON.parse((tr as HTMLElement).dataset.recipe!),
        ]),
      ),
    );
    await step(
      runId,
      "CHECK",
      `Read order tracker: ${orders.length} orders, ${stock.length} stock items`,
      { url: page.url() },
    );

    await page.goto(appUrl("/mock/calendar.html"));
    await page.waitForSelector("[data-testid=slot]");
    const calendar: CalendarSlot[] = await page.$$eval(
      "[data-testid=slot]",
      (els) =>
        els.map((el) => {
          const d = (el as HTMLElement).dataset;
          return {
            id: d.id!,
            kind: d.kind as CalendarSlot["kind"],
            start: d.start!,
            end: d.end!,
            title: d.title!,
          };
        }),
    );
    await capture(runId, page);
    await step(
      runId,
      "CHECK",
      `Read production calendar: ${calendar.length} events`,
      { url: page.url() },
    );

    // VERIFY: AI turns the message into fields; rules check them against the source text
    const profile = (await readState()).business;
    const bakery =
      (!profile || profile.category === "baker") &&
      Object.values(recipes).every((r) => r.unit === "kg");
    const prompt = bakery
      ? instructions(Object.keys(recipes), msg.receivedAt)
      : `Extract a custom order for a ${profile?.category ?? "custom-order"} business.
Products and their selling units: ${JSON.stringify(Object.fromEntries(Object.entries(recipes).map(([name, r]) => [name, r.unit])))}.
The message was received at ${msg.receivedAt} (India time, +05:30). Resolve relative dates against it.
Return JSON: {"customer": string, "product": exact product name or null, "customization": string, "quantity": number in that product's selling unit or null, "pickupAt": ISO 8601 with +05:30 offset or null, "constraints": string[]}.
Use null for anything not stated. Never guess.`;
    const ai = await extractJson<Omit<OrderRequest, "sourceMessageId">>(
      prompt,
      msg.body,
    );
    const req: OrderRequest = {
      ...ai,
      sourceMessageId: msg.id,
      constraints: ai.constraints ?? [],
    };
    const notes: string[] = [];
    if (req.pickupAt && !/(Z|[+-]\d\d:?\d\d)$/i.test(req.pickupAt))
      req.pickupAt += "+05:30"; // AI omitted the offset; the server may not be in IST
    if (
      req.quantity != null &&
      !statesQuantity(
        msg.body,
        req.quantity,
        recipes[req.product ?? ""]?.unit ?? "kg",
      )
    ) {
      notes.push(
        `quantity ${req.quantity} not found in the message text; cleared`,
      );
      req.quantity = null;
    }
    if (req.pickupAt && Date.parse(req.pickupAt) < Date.parse(msg.receivedAt)) {
      notes.push(
        `pickup ${req.pickupAt} is before the message was sent; cleared`,
      );
      req.pickupAt = null;
    }
    if (req.product && !recipes[req.product]) {
      notes.push(`"${req.product}" is not on the menu`);
    }
    const links = msg.body.match(/https?:\/\/\S+/g) ?? [];
    await step(runId, "VERIFY", `Order from ${msg.from}, message ${msg.id}`, {
      detail: [
        `Product: ${req.product ?? "—"} · Qty: ${req.quantity ?? "—"} · Pickup: ${req.pickupAt ? fmt(Date.parse(req.pickupAt)) : "—"}`,
        `Customisation: ${req.customization || "—"}`,
        req.constraints.length
          ? `Constraints: ${req.constraints.join("; ")}`
          : "",
        links.length
          ? `Links in message (not opened): ${links.join(", ")}`
          : "No links in message",
        ...notes.map((n) => `Check: ${n}`),
      ]
        .filter(Boolean)
        .join("\n"),
    });

    // REASON: fixed rules, not AI
    const report = checkOrder(req, { orders, stock, recipes, calendar });
    for (const c of report.clashes)
      await step(
        runId,
        "REASON",
        `${c.kind === "missing" ? "Missing" : "Clash"}: ${c.message}`,
      );
    if (!report.clashes.length)
      await step(
        runId,
        "REASON",
        "No clashes: calendar, working hours and stock all fit",
      );
    if (report.alternative)
      await step(
        runId,
        "REASON",
        `Nearest feasible pickup: ${fmt(Date.parse(report.alternative.pickupAt))}`,
      );

    // PREPARE: stage proposals, nothing is written yet
    const to = msg.from.match(/<([^>]+)>/)?.[1] ?? msg.from;
    const customer = req.customer || msg.from.replace(/<.*>/, "").trim();
    const first = customer.split(" ")[0];
    const missing = report.clashes.filter((c) => c.kind === "missing");
    const timeClash = report.clashes.some(
      (c) => c.kind === "calendar" || c.kind === "hours",
    );
    const short = report.clashes.filter((c) => c.kind === "stock");
    const pickupAt = timeClash
      ? report.alternative?.pickupAt
      : (req.pickupAt ?? undefined);
    const prep = timeClash
      ? report.alternative?.prep
      : (report.prep ?? undefined);
    const proposals: Proposal[] = [];
    const propose = (payload: Proposal["payload"], reason: string) =>
      proposals.push({
        id: newId("P"),
        runId,
        status: "pending_approval",
        payload,
        reason,
        createdAt: now(),
      });

    if (missing.length || !pickupAt || !prep) {
      const asks = missing.length
        ? missing
            .map(
              (c) => `- ${c.message.replace(/ not stated in the order/, "")}`,
            )
            .join("\n")
        : "- A different pickup day (we are fully booked around your time)";
      propose(
        {
          kind: "customer_reply",
          to,
          subject: `Re: order details`,
          body: `Hi ${first},\n\nThanks for your order! Before I can confirm, could you tell me:\n${asks}\n\nThanks,\n${profile?.name ?? "Sweet Crumbs"}`,
        },
        missing.length
          ? "Order is missing details; ask instead of guessing"
          : "No free slot within 3 days of the requested pickup",
      );
    } else {
      const id = `O-${Math.max(100, ...orders.map((o) => Number(o.id.slice(2)) || 0)) + 1}`;
      const order: Order = {
        id,
        customer,
        product: req.product!,
        quantity: req.quantity!,
        customization: req.customization,
        pickupAt,
        status: "confirmed",
        sourceMessageId: msg.id,
      };
      const when = fmt(Date.parse(pickupAt));
      propose(
        { kind: "sheet_row", order },
        timeClash
          ? `Requested time clashes; using nearest free pickup ${when}`
          : "Fits calendar, working hours and stock",
      );
      propose(
        {
          kind: "calendar_event",
          slot: {
            id: newId("C"),
            title: `Prep: ${id} ${req.product}`,
            start: prep.start,
            end: prep.end,
            kind: "prep",
            orderId: id,
          },
        },
        `${recipes[req.product!].prepHours} h prep ending at pickup`,
      );
      propose(
        {
          kind: "calendar_event",
          slot: {
            id: newId("C"),
            title: `Pickup: ${id} ${first}`,
            start: pickupAt,
            end: iso(Date.parse(pickupAt) + H / 4),
            kind: "pickup",
            orderId: id,
          },
        },
        "Blocks 15 minutes for handover",
      );
      if (short.length)
        propose(
          {
            kind: "calendar_event",
            slot: {
              id: newId("C"),
              title: `Buy: ${short.map((c) => c.evidence).join(", ")} for ${id}`,
              start: iso(Date.parse(prep.start) - 2 * H),
              end: iso(Date.parse(prep.start) - H),
              kind: "reminder",
              orderId: id,
            },
          },
          short.map((c) => c.message).join(" "),
        );
      const moved = timeClash
        ? `The ${fmt(Date.parse(req.pickupAt!))} slot is already taken, but I can have it ready for pickup on ${when}. Does that work for you?`
        : `It will be ready for pickup on ${when}.`;
      propose(
        {
          kind: "customer_reply",
          to,
          subject: `Re: your ${req.product} order`,
          body: `Hi ${first},\n\nThank you for your order of a ${req.quantity} ${recipes[req.product!].unit} ${req.product}${req.customization ? ` (${req.customization})` : ""}. ${moved}${req.constraints.length ? `\n\nNoted: ${req.constraints.join("; ")}.` : ""}\n\nThanks,\n${profile?.name ?? "Sweet Crumbs"}`,
        },
        timeClash
          ? "Offers the nearest free time instead of promising the requested one"
          : "Confirms the requested time",
      );
    }

    await step(
      runId,
      "PREPARE",
      `Prepared ${proposals.length} changes (not written)`,
      {
        detail: proposals
          .map((p) => `${p.payload.kind}: ${p.reason}`)
          .join("\n"),
      },
    );

    // APPROVE: hand over to the seller
    await updateState((s) => {
      s.proposals.push(...proposals);
      const m = s.inbox.find((x) => x.id === msg.id);
      if (m) m.read = true; // handled: the next check moves on to newer messages instead of re-staging this one
      const r = s.runs.find((x) => x.id === runId);
      if (r) {
        r.status = "awaiting_approval";
        r.input = msg.id;
        r.request = req;
        r.report = report;
        r.proposalIds = proposals.map((p) => p.id);
      }
      s.audit.unshift({
        at: now(),
        actor: "agent",
        action: "staged proposals",
        detail: `${proposals.length} changes for message ${msg.id}, waiting for approval`,
        source: `message ${msg.id}`,
      });
    });
    await step(
      runId,
      "APPROVE",
      `Staged ${proposals.length} changes; waiting for your approval`,
    );
  } finally {
    await browser.close();
  }
}
