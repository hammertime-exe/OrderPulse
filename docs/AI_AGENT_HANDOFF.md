# OrderPulse AI Agent Handoff

Project snapshot and continuation guide as of 26 November 2026

This handoff gives another coding agent enough context to continue OrderPulse without the original chat. Read the repository alongside this document and verify any state that may have changed. The local frontend and core approval workflows are implemented. Live AI extraction, external integrations and cloud deployment remain the main unfinished work.

### Project identity and user intent

OrderPulse is the main project. AidScout is an additional feature inside the same workspace, not a separate replacement project. The app serves custom-order micro-sellers: bakers, tailors, crafters, caterers and other small businesses. Seed data is bakery-focused; the business model is configurable.

Hackathon context: wHACKiest 2026, Track 2 Beyond the Browser, team SpicyChocolava. The central idea is an approval-first browser agent that reads requests, checks stock and scheduling, and prepares changes for a seller to review.

### Source and version baseline

Repository: https://github.com/hammertime-exe/OrderPulse
Branch: main
Latest inspected commit: c5ef2d8 — Complete OrderPulse frontend and AidScout workflows

The user successfully pushed that commit to origin/main. The working tree was clean before creating this handoff. The updated README is included in that baseline. This handoff is new documentation and has not been committed or pushed by this task.

Original local clone: C:/Users/rajni/Documents/ChatGPT/whakiest/OrderPulse. This path belongs to the current machine; a new agent should use its own checkout root. No credentials are included in this handoff.

### Frontend direction already accepted

The user asked for a clean, interactive, responsive interface and allowed designs beyond the old frontend. That redesign is implemented with indigo styling, workspace navigation and shared inline SVG icons. Preserve the working workflows when extending the UI. The project is not limited to bakers.

### How to use this handoff

Pages 2–3 map the implementation and its contracts. Page 4 explains setup and verification. Page 5 separates completed work from remaining work. Page 6 gives a continuation prompt and practical acceptance checks. Current code is the authority for exact request fields and validation.

## Architecture and source map

Stack: TypeScript, React, Vite, Tailwind and custom CSS; Node.js HTTP API; Playwright Chromium browser agents. Optional AWS scaffolding uses SAM, Lambda and DynamoDB. There is no separate application database service required for local development.

### Request and execution flow

React UI → /api calls through the Vite proxy → server/api.ts → management, workspace or approval functions → shared state. An agent run invokes agent/order.ts or agent/aidscout.ts asynchronously, records steps and stages proposals. Approval executes accepted effects into the app state; customer replies enter the demo outbox.

### Frontend files

web/src/App.tsx owns the shell, navigation, Overview, Calendar and approval entry points. OrderWorkspace.tsx handles request review and manual orders; InventoryWorkspace.tsx handles stock; AgentWorkspace.tsx shows runs and page evidence; AidScoutWorkspace.tsx handles portals, saved checklists and reminders; HistoryWorkspace.tsx handles audit/outbox views; WorkspaceSetup.tsx handles business configuration.

ProposalEditor.tsx edits pending actions. ui.tsx provides API and shared UI helpers including dialogs and date/time formatting. Icon.tsx is the typed SVG icon system. index.css supplies the main styling; main.tsx is the frontend entry point.

### Server and shared logic

server/api.ts routes requests and starts/expires/retries runs. management.ts previews and stages manual orders/revisions, adjusts stock, records delivery and stages reminders. workspace.ts saves business settings and edits drafts. approval.ts applies approval/rejection rules. store.ts loads and updates state. Matching *.test.ts files cover business rules.

shared/types.ts defines the domain contract. shared/clash.ts checks stock, quantity, hours and overlaps and finds alternatives. shared/time.ts provides time helpers. shared/gate0.ts contains the vetted official host list and lookalike checks.

### Agents and persistence

agent/order.ts reads the inbox/tracker/calendar and prepares an order plan. aidscout.ts checks portals and extracts sourced tasks. ai.ts handles JSON extraction, provider fallback and cached responses. browser.ts launches Chromium. steps.ts records activity and captures the latest small JPEG snapshot.

Local state is data/state.json, seeded from seed/state.json. With STATE_TABLE configured, the whole state is stored in one DynamoDB item with optimistic version checks. This is a single-workspace demo design, not multi-seller storage. web/public/mock/ contains controlled browser pages. infra/ contains packaging and deployment scaffolding.

## Domain contracts and behaviour to preserve

### Data model

State contains business, version, inbox, sent, orders, stock, recipes, calendar, proposals, audit and runs. Order quantities use each recipe’s selling unit. Recipe.prepHours is per order; materials are quantities per selling unit. Orders are confirmed or delivered. Calendar slots are prep, pickup, personal or reminder.

Proposal payload kinds are sheet_row, calendar_event, customer_reply and checklist. Proposal statuses are pending_approval, approved, rejected, executed and failed. Run statuses are running, awaiting_approval, done and failed. Run phases are CHECK, VERIFY, REASON, PREPARE, APPROVE and EXECUTE. Null extracted fields mean unstated information, not permission to invent values.

### Core API surface

GET /api/state reads workspace state. POST /api/runs starts an order or AidScout run; /api/runs/retry retries eligible failed runs. POST /api/proposals/approve and /reject accept an ids array. POST /api/proposals/edit edits a pending draft. Read the handlers for exact bodies and result shapes.

Other POST routes: /api/orders/preview, /api/orders/stage, /api/orders/deliver, /api/stock/adjust, /api/reminders/stage, /api/checklist/toggle, /api/workspace and /api/reset. No production authentication layer is implemented. Do not treat this API as safe for untrusted public use.

### Approval and stock invariants

Agent proposals do not apply order/calendar/reply effects until approved. Manual order/revision plans apply together; rejected revisions preserve original rows and slots. Pending plans reserve neither stock nor capacity, so approval checks current state again. A confirmation reply must wait for its order and required slots.

Editing an order updates linked draft slots and requires explicit reply review. Original recipients remain fixed. Stale edits and conflicting plans must fail without partial mutation. Settings changes are blocked during active runs or pending approvals; recipes used by existing orders cannot silently change.

Stock distinguishes on-hand, committed and free quantities. Restocking is allowed while approvals wait; reductions are blocked until pending approvals resolve. Delivery requires confirmation and consumes materials exactly once. A restock reminder is not evidence of purchase. Working hours remain fixed at 08:00–21:00 IST.

### AidScout and demo boundaries

Gate 0 uses a vetted host list, HTTPS and lookalike rules; it is not a security or eligibility guarantee. Unverified external sites are not opened; controlled .example pages are locally served for the demo. Checklist items require matching source quotes. Forms are never submitted. Customer replies stay in sent; saved reminder events have no background notification delivery.

## Local setup and verified evidence

### Install and run

Use Node.js 24 or newer. From the repository root:
npm install
npm run browsers
Copy .env.example to .env only when configuring extraction.
Terminal 1: npm run api
Terminal 2: npm run dev

Dashboard: http://localhost:5173
API: http://localhost:8787
Vite proxies /api to the API. APP_URL must point to the frontend serving the controlled pages. The previous browser preview used http://127.0.0.1:5173/. Runtime availability is temporary; check both processes before assuming they are still running.

### AI configuration

At inspection, .env is absent and seed/ai-cache.json is empty. Manual orders and most dashboard actions work without AI. Order extraction and official-page checklist generation require a configured provider or matching cached response.

Use GROQ_API_KEY, GEMINI_API_KEY, or all of AI_BASE_URL, AI_API_KEY and AI_MODEL. The helper checks the cache first, then configured custom, Groq and Gemini providers in order. GROQ_MODEL and GEMINI_MODEL optionally override defaults. Restart the API after configuration changes. Keep secrets in ignored .env; review cached extraction content before committing it.

APP_URL defaults to http://localhost:5173. HEADLESS=1 hides the browser; SLOW_MO controls local browser delay. The default local agent browser is visible. Chromium must be installed through npm run browsers.

### Checks rerun for this handoff

On 26 November 2026: npm test passed all 40 tests; npm run typecheck passed; npm run build passed. Tests cover approvals, stale state, stock, delivery, manual orders/revisions, settings, draft edits, selling units, clashes and Gate 0. Build success verifies frontend compilation, not AWS deployment.

### Earlier browser evidence and its limits

Earlier checks exercised desktop and 390px mobile layouts, manual order staging/rejection, stock changes, extraction handoff, reply edits, whole-plan approval, delivery deduction, checklist progress, reminder approval, business-name persistence, search/filtering and full outbox visibility. Checked mobile screens had no whole-page horizontal overflow.

The end-to-end extraction recheck used synthetic requests and a deterministic local provider fixture in an isolated workspace. Checklist interactions used an approved fixture. A controlled lookalike run produced a warning and real page capture. These checks do not prove live AI accuracy or official-page extraction reliability. Avoid overwriting the seller’s saved workspace for tests; npm run reset deletes local data changes.

## Completed work and remaining scope

### Implemented frontend and local workflows

Overview and responsive sidebar; Orders search/status filters and original-message/evidence review; manual creation and existing-order revisions; Inventory quantities and reasoned adjustments; day/week Calendar with filters; Approval desk with draft editing; Agent activity with phase/run filtering, retry and actual snapshots; AidScout portal catalog/search, source conditions/quotes, saved checklist progress and staged reminders; searchable History and complete demo outbox; configurable Business setup.

Shared SVG icons replaced text symbols. Notifications, recovery/empty states, modal dialogs and unsaved settings checks are present. No blocking frontend compile or automated-test failure is known from the current checks. Comprehensive accessibility and real-world workflow testing remain incomplete.

### Next work for a complete live demonstration

1. Configure a supported live AI provider locally. Verify the original request produces correct fields, explicit missing details and a suitable reply. Exercise rate limits/failures and repeat with a non-bakery catalog and selling unit.

2. Verify AidScout against live official content. Check every extracted requirement, quote and stated deadline; exercise unavailable pages, redirects, layout changes and CAPTCHA uncertainty. Do not imply personalised eligibility from portal checks.

3. Rehearse the order/clash/stock/alternative/approval story and AidScout extension using synthetic data. Record a successful run after live verification as a fallback; clearly identify fixtures or recordings.

### Integrations and deployment still unfinished

Gmail, WhatsApp, Google Sheets and Google Calendar are not connected. Inbox/tracker/calendar pages are controlled /mock/ pages; replies are an internal demo outbox. Real external writes need connectors, account permissions, reconnection handling and duplicate-action protection. Background email, push or SMS reminders need a scheduler and delivery channel.

AWS SAM, Lambda packaging and DynamoDB code exist but deployment and packaging were not verified. The template targets Node.js 22 versus local Node.js 24. Validate npm run build:lambda and runtime compatibility before an authorised deployment. The supplied Function URL has AuthType NONE; no live credentials or real seller data should be exposed through that demo configuration. Current pricing/free-tier assumptions were not validated.

### Before real customer use and optional additions

Required: login, seller isolation, server-side authorisation, suitable multi-user storage, backups, retention, monitoring, recovery, concurrency checks and wider browser/accessibility testing. Optional: configurable hours, staff/equipment capacity, drag-and-drop scheduling, local languages, analytics and more portals. These are proposed future work, not completed features.

## Continuation guide for another AI agent

### Suggested starting prompt

You are continuing OrderPulse from the repository and attached handoff. OrderPulse is the main custom-order seller project; AidScout is an additional integrated feature. Read README.md, shared/types.ts and the relevant source before editing. Inspect git status and the current commit. Preserve existing approval, stock, scheduling and source-evidence rules. State which checks you actually run. Distinguish live verification from local fixtures. Implement the user’s next requested task; use this handoff as context, not as permission to deploy, send messages or reset saved data.

### First actions in a fresh checkout

Inspect README.md and package.json, then git status, git log -1 and git remote -v. Install dependencies/browser if needed. Run npm test, npm run typecheck and npm run build to establish a baseline. Start API/frontend if interaction checks are needed. Confirm whether extraction is configured without printing any keys.

Ask the user which remaining milestone they want only if the next request does not identify it. The likely next technical milestone is real provider extraction and official-page verification, because core frontend work is already implemented. Do not rebuild the UI or declare all integration complete merely because it compiles.

### Acceptance checks when changing a workflow

Order path: review an incoming request or enter a manual order; preview rules; stage it; inspect proposed details; edit the order and review the reply; approve; verify rows, slots, audit and outbox. Confirm rejection preserves original data and stale approvals cannot bypass current stock/calendar constraints.

Inventory path: adjust with a reason; verify on-hand/committed/free quantities; deliver once and confirm materials are deducted once. Reject an attempted second deduction and insufficient-stock delivery without partial changes.

AidScout path: verify the controlled lookalike warning; check an official source with configured extraction; review quotes; approve a checklist; mark a task; stage and approve a reminder; inspect calendar/history. A calendar entry alone is not proof of a sent notification.

UI path: inspect desktop and phone widths, dialogs, keyboard focus, loading/error/empty states and relevant SVG icons. Test the changed behaviour, then run appropriate existing tests/type checking/build. Report any remaining limitation with its actual evidence.

### Sharing this document

Give the next agent the repository URL and this handoff. A matching Markdown copy is saved at docs/AI_AGENT_HANDOFF.md in the local repository for direct code-agent ingestion. It is new documentation relative to c5ef2d8. Commit and push that file separately if it should be available to agents cloning GitHub. Refresh status claims after later code changes.
