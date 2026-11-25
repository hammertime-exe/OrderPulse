# OrderPulse

**An approval-first workspace and browser agent for custom-order sellers.**

wHACKiest 2026 · Track 2 “Beyond the Browser” · Team SpicyChocolava

OrderPulse helps bakers, tailors, crafters, caterers and other small sellers review incoming requests, check stock and scheduling, and approve proposed changes. **OrderPulse is the main project. AidScout is an additional feature within the same app** for checking official portal addresses and organising source-linked tasks.

The seeded demo uses a bakery catalog. Business setup supports other seller types, selling units, products and materials.

## Current status

The responsive frontend and core local workflows are implemented. Current verification includes **40 passing automated tests**, TypeScript checking and a production frontend build, plus desktop and mobile browser checks.

This is a local demo with controlled inbox, tracker and calendar pages. Live AI extraction, real seller-service integrations and AWS deployment still need verification. Customer replies currently go to an internal demo outbox.

## Features

| Workspace | Available functionality |
|---|---|
| Overview | Workspace counts, incoming requests, schedule summaries and order-check entry point |
| Orders | Search and status filters, source-message review, extracted fields, stock and clash evidence, manual orders and order revisions |
| Inventory | Separate on-hand, committed and free stock; quantity adjustments with recorded reasons |
| Calendar | Day/week views, date navigation, event filters and event details |
| Approval desk | Review, edit, approve or reject proposed orders, events, replies and checklists |
| Agent activity | Run selection, phase filters, step details, source links, retry controls and the latest page capture |
| AidScout | Portal starting-point search, Gate 0 URL checks, source quotes, checklists, task progress and proposed reminders |
| History | Searchable audit entries, actor/action/date filters and full demo reply bodies |
| Business setup | Business profile, product units, preparation time, material requirements and stock configuration |

The UI includes shared SVG icons, responsive navigation, modal dialogs, notifications, empty states, connection/error recovery and unsaved-settings checks.

## How the workflows work

### OrderPulse

1. Start **Check new orders** from **Overview**.
2. The browser agent reads the demo inbox, tracker and calendar. AI extracts fields from the incoming message.
3. Deterministic rules check configured product requirements, stock, working hours and calendar overlaps.
4. The agent stages proposed order details, preparation/pickup slots, any restock reminder and a customer reply.
5. Review the original request, evidence and proposed changes in the app. Edit drafts where needed.
6. Approve or reject changes in **Approval desk**. Executed changes and decisions appear in **History**.

Manual order creation and revisions use the same stock/schedule checks and approval workflow without requiring AI extraction.

### AidScout

1. Choose a portal starting point or enter a URL.
2. Gate 0 classifies it as **Official source confirmed**, **Unable to verify** or **Potential lookalike** using the vetted host list and lookalike rules.
3. For an approved official source, the agent attempts to read the page and extract checklist items with supporting quotes and any stated deadline.
4. Review and approve the checklist. Track tasks and stage custom reminders for approval.

Unverified external addresses are not opened. The controlled `.example` lookalike demonstration is served locally. AidScout never fills or submits application forms. A matching hostname is a risk screen, not proof of eligibility, current scheme availability or site security.

Run activity uses these phases:

**CHECK → VERIFY → REASON → PREPARE → APPROVE → EXECUTE**

## Run locally

### Prerequisites

- Node.js **24 or newer**, npm and Git
- Chromium installed through the command below
- An AI provider key for live order/checklist extraction; manual workflows do not require one

### 1. Clone and install

```sh
git clone https://github.com/hammertime-exe/OrderPulse.git
cd OrderPulse
npm install
npm run browsers
```

`npm run browsers` installs the Chromium browser used by the agent.

### 2. Configure extraction

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```sh
cp .env.example .env
```

Set one supported provider in `.env`:

```dotenv
# Groq
GROQ_API_KEY=your_key_here

# Or Gemini
GEMINI_API_KEY=your_key_here

# Or an OpenAI-compatible chat provider supporting JSON responses
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=your_key_here
AI_MODEL=your_model_name

# Local demo pages
APP_URL=http://localhost:5173
# Set to 1 to hide the agent browser window
HEADLESS=
```

Configure only the provider(s) you intend to use. The extraction helper checks matching cached responses first, then tries configured providers in this order: custom, Groq, Gemini. Optional `GROQ_MODEL` and `GEMINI_MODEL` environment variables override the defaults in `agent/ai.ts`. Check your provider's current model support and pricing.

The repository starts with an empty `seed/ai-cache.json`. Without a provider key or matching cached extraction, the dashboard, manual orders, inventory, settings and controlled lookalike check remain available; live order extraction and official-page checklist generation need configuration. Restart the API after changing `.env`.

Keep keys in `.env`, which is ignored by Git. Successful extractions can be saved in `seed/ai-cache.json`; use synthetic data and review cached content before committing it.

### 3. Start the app

Use two terminals in the repository root:

```sh
# Terminal 1: API and agent
npm run api
```

```sh
# Terminal 2: frontend and demo pages
npm run dev
```

Open **http://localhost:5173**. The API listens on **http://localhost:8787**, and Vite proxies `/api` requests to it. Keep the frontend URL aligned with `APP_URL` if you change the port or host.

The browser agent's controlled pages are:

- `/mock/inbox.html`
- `/mock/tracker.html`
- `/mock/calendar.html`

These pages reflect approved app state; they are not connected Gmail, WhatsApp, Google Sheets or Google Calendar accounts.

## Try the demo

1. Open **Business setup** to inspect the seeded catalog or configure another seller type.
2. In **Orders**, create a manual order and use **Check stock & schedule** before staging it for approval.
3. Alternatively, with extraction configured, use **Overview → Check new orders** and inspect **Agent activity**.
4. In **Approval desk**, review the proposed order, linked slots and reply. After editing an order, review and save its reply before approval.
5. Approve the plan, then inspect **Orders**, **Calendar**, **Inventory** and **History**.
6. Use the order's delivery confirmation to record delivery and deduct its materials once.
7. In **AidScout**, try the controlled lookalike check, then an official source with extraction configured. Review a checklist and stage a task reminder.

## Business setup and approval behaviour

- Configure the business name/type, selling units, preparation time per order and material quantities per selling unit. New sample products start with zero stock; enter available quantities before accepting orders.
- Existing demo orders remain when settings change. Recipes used by existing orders are locked to preserve material commitments; add a new product for different requirements.
- Finish active runs and pending approvals before changing settings. Saves check workspace revisions; reload saved settings if another action changed the workspace.
- Working hours are currently fixed at **08:00–21:00 IST**. The agent uses configured selling units and the saved business name in reply drafts.
- Draft edits remain pending. Order edits recheck stock/capacity and keep linked preparation and pickup slots in sync. Edit linked slots through the order.
- Order draft edits are available before any action in that run has been approved or rejected. Changing an order requires explicit reply review; existing wording is preserved until reviewed.
- Manual order/revision plans apply together. Pending proposals do not reserve stock or calendar capacity, so approval rechecks current state.
- Confirmation replies cannot execute before their pending order and required time slots. Rejected revisions preserve the existing order.
- Restocking is available while proposals are pending; stock reductions wait until pending approvals are resolved. Adjustments require a reason.
- Delivery deducts material consumption once. A restock reminder does not establish that supplies were purchased; resolve physical shortages before delivery.
- Approved customer replies stay in the demo outbox. Saved reminders are calendar events; background email, push and SMS delivery are not implemented.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Latest local verification: **40 tests passed**, type checking passed and the frontend build passed. Tests cover approval rules, stale-state protection, stock, delivery, clash handling, settings, draft edits, units and Gate 0 cases.

Browser checks covered desktop/mobile layouts and key interactions: manual order staging/rejection, stock adjustments, reply editing, approval, delivery, checklist progress, reminders, settings persistence and history/outbox visibility. The extraction workflow recheck used synthetic inputs and a deterministic local fixture in an isolated workspace. The controlled lookalike check produced a warning and actual page capture.

These checks verify local application behaviour. They do not establish live provider accuracy, official-portal extraction reliability, exhaustive accessibility coverage or deployed AWS behaviour.

### Reset demo data

Use **Reset demo data** in the running app, or stop the API and run:

```sh
npm run reset
```

This deletes local `data/` state and restores the seeded demo on the next load. It removes saved local workspace changes.

## What remains

### Complete a live demo

- Configure and test a real AI provider, including missing details, failed/rate-limited calls and a non-bakery product catalog.
- Verify official-page extraction, supporting quotes and stated deadlines against live portals; exercise redirects, unavailable pages, changed layouts and CAPTCHA cases.
- Rehearse the complete order/clash/stock/approval story and the AidScout extension with repeatable synthetic demo data.
- Validate Lambda packaging, runtime compatibility and deployment before describing the app as hosted.

### Before real customer use

- Add authentication, seller-specific storage and server-side authorisation.
- Replace the single shared JSON/DynamoDB state document with storage suitable for multiple sellers; add backup, retention, monitoring and recovery.
- Implement authorised seller-service connectors, actual message sending, permission/reconnection handling and duplicate-action protection.
- Add a background scheduler and notification channel for reminders while the app is closed.
- Broaden real seller, keyboard/screen-reader, cross-browser, concurrency and failure-recovery checks.

Optional extensions include configurable hours, staff/equipment capacity, calendar drag and drop, local languages, analytics and wider portal coverage.

## AWS deployment scaffolding

The repository includes an AWS SAM template, Lambda packaging scripts and a DynamoDB storage path. **Packaging and deployment have not been verified in the current work.** The template targets Node.js 22 while local development uses Node.js 24; validate packaged runtime compatibility.

With the AWS CLI and SAM CLI configured for an authorised account:

```sh
npm run build:lambda
npm run deploy
```

The template defines two Lambda functions and one DynamoDB table. Its function URL uses `AuthType: NONE`, so the supplied configuration is a public demo without login. Add authentication before using real seller data. Review current AWS costs and account limits; free-tier coverage has not been validated.

## Tech stack and project layout

| Part | Technology |
|---|---|
| Language | TypeScript |
| Frontend | React, Vite, Tailwind CSS and custom CSS |
| Browser automation | Playwright with Chromium |
| Local API | Node.js HTTP server |
| Field extraction | Groq, Gemini or a configured OpenAI-compatible provider |
| Optional infrastructure | AWS Lambda, DynamoDB and SAM |

| Location | Responsibility |
|---|---|
| `web/src/` | Frontend workspaces, SVG icons, forms, dialogs and notifications |
| `web/public/mock/` | Controlled inbox, tracker, calendar and lookalike pages |
| `server/` | API, approvals, stock/settings management, state storage and tests |
| `agent/` | Order and AidScout agents, extraction, browser launch and page captures |
| `shared/` | Types, time helpers, stock/clash rules and Gate 0 checks |
| `seed/` | Synthetic demo state and extraction cache |
| `infra/` | Lambda packaging and SAM deployment template |

Page captures are real JPEG snapshots, not a live video stream. Only the latest small capture is retained. Use synthetic demo data and review source, cached extracts and configuration before publishing changes.
