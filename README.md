# OrderPulse

wHACKiest 2026 · Track 2 "Beyond the Browser" · Team SpicyChocolava

An approval-first browser agent for home bakers, tailors and crafters. It opens the order inbox, tracker and calendar, finds clashes with fixed rules, and stages a sheet row, calendar slot and customer reply. Nothing is written until the seller approves. The AidScout module runs the same flow on official scheme portals, with a Gate 0 lookalike check.

**CHECK → VERIFY → REASON → PREPARE → APPROVE → EXECUTE**

## Run it locally

Needs Node 24 (runs `.ts` files directly, no build step).

```sh
npm install
npm run browsers       # one-time: downloads Chromium for Playwright
cp .env.example .env   # add a free GROQ_API_KEY (optional when ai-cache has the reply)
npm run api            # API + agent on :8787
npm run dev            # dashboard + mock sites on :5173
npm test               # clash engine + Gate 0 tests
npm run reset          # back to the seeded demo data
```

## Deploy to AWS (always-free pieces only)

Needs the AWS CLI and SAM CLI, configured for your account.

```sh
npm run build:lambda   # vite build + esbuild bundles into dist/lambda/{api,agent}
npm run deploy         # sam deploy --guided; enter your Groq key when asked
```

The stack is one provisioned DynamoDB table (10 RCU / 15 WCU, inside the 25/25 free tier) and two Lambdas with Function URLs (no API Gateway). `sam deploy` uploads the code through an S3 bucket it creates, which is the one non-always-free piece (a few MB). The Function URL is public: anyone with the link can approve demo changes.

## Layout

| Folder | What |
|---|---|
| `shared/` | Types (the contract), clash engine, Gate 0. Pure TS, no I/O. |
| `seed/` | Synthetic demo data and the AI reply cache. |
| `server/` | Store (JSON file locally, DynamoDB on AWS), API routes, approval engine. |
| `agent/` | Playwright runs: order agent, AidScout. AI helper, browser launcher. |
| `web/` | React dashboard. `web/public/mock/` holds the mock inbox, tracker, calendar and lookalike portal the agent browses. |
| `infra/` | AWS SAM template (two Lambdas + one DynamoDB table). |

## Branches

Every feature lives on its own branch off `main` and merges through a PR. `main` holds the contract (`shared/types.ts`), seed data and stubs so branches merge in any order.

| Branch | Delivers |
|---|---|
| `feat/clash-engine` | `shared/clash.ts`: calendar, hours, stock and missing-field checks + nearest feasible pickup |
| `feat/gate0` | `shared/gate0.ts`: official / unable to verify / potential lookalike |
| `feat/api` | `server/`: routes, approval engine (recheck before commit, audit log), local dev server |
| `feat/mock-sites` | `web/public/mock/`: inbox, order tracker, calendar, lookalike portal |
| `feat/order-agent` | `agent/order.ts`: hero demo run |
| `feat/aidscout` | `agent/aidscout.ts`: Gate 0 + source-quoted checklist |
| `feat/dashboard` | `web/src/`: Today, agent activity, approval desk, AidScout, history |
| `feat/aws-deploy` | `infra/`, Lambda handlers, DynamoDB store |

## API contract

| Method | Path | Body → Reply |
|---|---|---|
| GET | `/api/state` | → `State` |
| POST | `/api/runs` | `{ kind: 'order' }` or `{ kind: 'aidscout', input: url }` → `{ runId }` |
| POST | `/api/proposals/approve` | `{ ids: string[] }` → `{ results }` |
| POST | `/api/proposals/reject` | `{ ids: string[] }` → `{ results }` |
| POST | `/api/checklist/toggle` | `{ proposalId, itemId }` → `{ ok }` |
| POST | `/api/reset` | → `{ ok }` (demo only) |

## Safety rules

- Synthetic data only. No Aadhaar, bank details or minors' data.
- The agent never submits forms, pays or sends messages. Customer replies go to a demo "sent" folder after approval.
- Inaccessible pages and unverified facts are labelled "Unable to verify", never guessed.
