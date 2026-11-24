# OrderPulse

**An approval-first browser agent for home-based sellers.**
wHACKiest 2026 · Track 2 "Beyond the Browser" · Team SpicyChocolava

## What it is

Home bakers, tailors and crafters take custom orders over email and chat, track them in a sheet and plan their week in a calendar. Nothing checks these against each other, so clashes show up late: a pickup promised in a slot already taken, or a cake promised without enough cream.

OrderPulse is a browser agent that does that checking. It opens the seller's own web tools the way a person would, finds the problems, and prepares the fixes. **Nothing is saved or sent until the seller approves it.**

## Who it helps

- **Home-based micro-sellers** (bakers, tailors, crafters) who take custom orders and make everything themselves.
- **Their households**, who look for government schemes and registrations online and need to avoid fake lookalike portals.

## What it does

**Order check (main flow)**
1. Opens the order inbox and reads the newest order.
2. Pulls out the product, quantity, design and pickup time. The AI is used only for this step.
3. Opens the order tracker and the production calendar.
4. Uses fixed rules, not AI, to check kitchen hours, calendar overlaps and stock. It finds the nearest free pickup time.
5. Prepares a tracker row, calendar slots, a restock reminder and a reply to the customer.
6. Waits. The seller approves or rejects each change in one approval desk, and every decision is logged.

**AidScout (scheme and portal check)**
1. Runs "Gate 0" on a portal address: **Official source confirmed**, **Unable to verify** or **Potential lookalike**.
2. Does not open unverified sites, and never fills in forms on lookalikes.
3. On an official page (for example Udyam registration), builds a document checklist. Every item quotes the exact line on the page it came from.
4. Suggests a calendar reminder, which also waits for approval.

Every run follows the same steps, shown live in the dashboard:
**CHECK → VERIFY → REASON → PREPARE → APPROVE → EXECUTE**

## Tech stack

| Part | Tool |
|---|---|
| Language | TypeScript |
| Dashboard | React, Vite, Tailwind CSS |
| Browser agent | Playwright (Chromium) |
| Backend | Node.js |
| AI (field extraction only) | Groq, with Gemini as a backup |
| Cloud (optional) | AWS Lambda, DynamoDB, SAM |

## Safety rules

- **Approval first.** No order, calendar event, reply or checklist is written until the seller approves it. Rejected changes leave everything as it was.
- **No sending, paying or submitting.** The agent never submits forms, makes payments or sends messages. Approved customer replies go to a demo "Sent" folder inside the app.
- **No guessing.** Missing order details are asked for, not invented. Pages that don't load and facts the agent can't check are labelled "Unable to verify".
- **Sources for everything.** Every checklist item quotes the official page it came from. Items whose quote isn't on the page are dropped.
- **Gate 0 is a risk screen, not a guarantee.** A site that isn't on the official list is not automatically fake.
- **Synthetic data only.** No Aadhaar numbers, bank details or children's personal data. All demo orders and customers are made up.

## Run it on your computer

You need **Node.js 24** or newer and Git (or the downloaded ZIP).

**1. Install** (in the project folder)

```sh
npm install
npm run browsers
```

`npm run browsers` downloads the Chromium browser the agent uses. You only need to run it once.

**2. Add your API key** (this is what turns on the full demo)

Copy the example settings file to `.env`:

```powershell
Copy-Item .env.example .env    # Windows PowerShell
```

```sh
cp .env.example .env           # macOS / Linux
```

Open `.env` and add **one** of the options below, pasting your key after the `=` sign with no spaces or quotes. You only need one key. If you fill in more than one, the app tries them in this order: your own provider, then Groq, then Gemini.

**Option A: Groq (free, recommended)**

```
GROQ_API_KEY=gsk_your_key_here
```

Get it at [console.groq.com](https://console.groq.com) → API Keys → Create API Key.

**Option B: Google Gemini (free)**

```
GEMINI_API_KEY=your_key_here
```

Get it at [aistudio.google.com](https://aistudio.google.com) → Get API key.

**Option C: any other provider you already have a key for**

Any provider with an OpenAI-compatible API works. Fill in all three lines:

```
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your_key_here
AI_MODEL=model-name-from-your-provider
```

| Provider | `AI_BASE_URL` |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Mistral | `https://api.mistral.ai/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |

For `AI_MODEL`, use a chat model name from your provider's docs. A small, cheap model is enough because the AI only pulls fields out of text.

Put your keys only in `.env`, never in `.env.example`. Git ignores `.env`, so your keys are never uploaded.

Without a key, the dashboard, the demo pages and the Gate 0 lookalike check still work. "Check new orders" and the official-page checklist need a key, unless the reply is already saved in `seed/ai-cache.json`.

**3. Start it** (two terminals, both in the project folder)

```sh
npm run api     # terminal 1: API and agent
```

```sh
npm run dev     # terminal 2: dashboard and demo pages
```

**4. Try it**

Open **http://localhost:5173**.

- **Today** → **Check new orders**. A browser window opens and you can watch the agent work.
- **Agent activity** shows each step and the page it is on.
- **Approval desk**: review the staged changes, reject any you don't want, then **Approve all**.
- **History** shows the audit trail and the demo outbox.
- **AidScout**: try **Lookalike test site**, then **Official Udyam portal**.

The demo pages the agent browses are at `/mock/inbox.html`, `/mock/tracker.html` and `/mock/calendar.html`. They update after you approve.

**Useful commands**

```sh
npm test         # run the automated tests
npm run reset    # restore the original demo data (stop the API first)
```

**Reset demo** on the Today screen does the same while the app is running.

## Deploy to AWS (optional)

Needs the AWS CLI and SAM CLI set up for your account.

```sh
npm run build:lambda
npm run deploy      # asks for your Groq key during setup
```

This creates two Lambda functions and one DynamoDB table. The app link is public and has no login, so use it only for the demo.

## Project layout

| Folder | What's inside |
|---|---|
| `shared/` | Data types, clash rules, Gate 0 check |
| `server/` | API, approval engine, data store |
| `agent/` | Browser agents (order check, AidScout), AI helper |
| `web/` | Dashboard; `web/public/mock/` holds the demo inbox, tracker, calendar and lookalike page |
| `seed/` | Demo data and saved AI replies |
| `infra/` | AWS deployment template |
