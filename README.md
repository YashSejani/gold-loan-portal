# Gold Loan Portal with Loan Assist

A gold-loan intake portal for a lending partner. A borrower or field agent enters jewellery details and gets a
**preliminary loan offer**, then applies in one of two ways:

1. a guided **3-step web form** (Details → live Quote → Confirm), or
2. **Loan Assist**, an AI chat assistant that calls typed backend tools.

Both paths go through the **same validated service layer**, so they produce identical numbers and identical
leads. An **admin page** lists the leads (newest first, masked mobiles, filter by plan).

> _Screenshot: Apply, step 2 (live quote with plan cards), add `docs/screenshots/apply-quote.png`_
>
> _Screenshot: Loan Assist confirmation card, add `docs/screenshots/loan-assist.png`_
>
> _Screenshot: Admin leads table, add `docs/screenshots/admin.png`_

**Stack:** npm workspaces · TypeScript (strict) · Express 5 · Zod 4 · PostgreSQL 16 + Prisma 6 · React 19 +
Vite + Tailwind 4 · Vitest + Supertest + React Testing Library · `openai` SDK against any OpenAI-compatible LLM
(Gemini by default) · pino.

---

## Contents

- [Quick start](#quick-start)
- [Without Docker](#without-docker)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [API reference](#api-reference)
- [Money maths and rounding](#money-maths-and-rounding)
- [Architecture](#architecture)
- [Loan Assist (agent) design](#loan-assist-agent-design)
- [LLM used and how to switch providers](#llm-used-and-how-to-switch-providers)
- [Tests](#tests)
- [Bonus attempted](#bonus-attempted)
- [What I'd do with more time](#what-id-do-with-more-time)
- [Where I got stuck](#where-i-got-stuck)

---

## Quick start

**Prerequisites:** Node.js **20+** (developed on 22), npm 10+, and **Docker** (for PostgreSQL). For the
assistant, a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/YashSejani/gold-loan-portal.git
cd gold-loan-portal
cp .env.example .env          # then set LLM_API_KEY=... in .env (only needed for Loan Assist and evals)
npm install                   # also generates the Prisma client
npm run dev                   # Postgres (Docker) → migrations → seed → API :4000 + web :5173
```

Open <http://localhost:5173> (Apply) and <http://localhost:5173/admin> (Leads).

```bash
npm test                      # all unit + API + UI tests (uses the separate goldloan_test database)
npm run eval                  # 5 Loan Assist conversations against the real LLM (needs LLM_API_KEY)
```

- `npm run dev` and `npm test` create `.env` from `.env.example` if it's missing, start Postgres with
  `docker compose up -d --wait` (which waits for the health check), and are safe to run repeatedly.
- **Without `LLM_API_KEY`** everything works except the chat: the API logs a warning and `/api/v1/chat`
  answers `503 AGENT_UNAVAILABLE`. The form and admin page are unaffected.
- Docker Compose creates **two databases**: `goldloan` (dev) and `goldloan_test` (tests and evals; tables are
  emptied between tests, so never point it at real data).

> **VS Code users:** if the Python extension's `python.terminal.useEnvFile` setting is on, VS Code copies
> `.env` into each terminal when it opens, and those values win over the file. After editing `.env`, open a new
> terminal (or turn that setting off) before `npm run dev`.

## Without Docker

Use any PostgreSQL 14+ you already have:

1. Create two databases, e.g. `goldloan` and `goldloan_test`, owned by a user that can create tables.
2. In `.env`, set `DATABASE_URL` and `DATABASE_URL_TEST` to them. They must be different: tests empty the
   `Lead` table.
3. Skip the Docker steps by running the pieces yourself:

```bash
npm install
npm run db:migrate && npm run db:seed
npm run dev -w apps/api            # API on :4000
npm run dev -w apps/web            # web on :5173 (second terminal)
npm run test --workspaces          # tests (migrations for the test DB run automatically)
npm run eval                       # evals (also migrate the test DB themselves)
```

## Environment variables

All variables live in the repo-root `.env` (copy of `.env.example`). Only `.env.example` is committed.

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `PORT` | `4000` | API | HTTP port |
| `NODE_ENV` | `development` | API | `production` stops logging chat text (masked chat text is logged in development); `test` silences logs |
| `DATABASE_URL` | `postgresql://goldloan:goldloan@localhost:5432/goldloan` | API, Prisma | Dev database |
| `DATABASE_URL_TEST` | `…/goldloan_test` | tests, evals | Test database; **must differ** from `DATABASE_URL` (checked) |
| `GOLD_RATE_24K_PAISE_PER_GRAM` | `700000` (₹7,000/g) | API | Mock 24K gold rate, integer paise per gram. Invalid → quotes answer `503 GOLD_RATE_UNAVAILABLE` |
| `CORS_ORIGIN` | `http://localhost:5173` | API | Allowed browser origin (the Vite dev server) |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | API | Any OpenAI-compatible endpoint |
| `LLM_API_KEY` | _(empty)_ | API, evals | Provider key. Stays on the server; never sent to the browser |
| `LLM_MODEL` | `gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite` | API | **Comma-separated, best first.** Later models are fallbacks (see [LLM](#llm-used-and-how-to-switch-providers)) |
| `EVAL_DELAY_MS` | `4000` | evals | Pause between eval conversations (free-tier rate limits) |
| `VITE_API_URL` | _(empty)_ | web | API base URL. Empty = same origin through the Vite proxy (`/api` → `localhost:4000`) |

## Scripts

Run from the repo root.

| Script | What it does |
|---|---|
| `npm run dev` | Ensure `.env` → start Postgres (Docker, waits until healthy) → apply migrations → seed → run API (`tsx watch`, :4000) and web (Vite, :5173) together |
| `npm test` | Ensure `.env` → start Postgres → Vitest in every workspace (shared, api, web). API tests migrate and seed the test DB once and empty leads between tests |
| `npm run typecheck` | `tsc` (strict) in every workspace |
| `npm run eval` | Loan Assist conversations against the real LLM and the test DB; prints a PASS/FAIL table, exits 1 on failure. `npm run eval -- happy` runs only matching ids |
| `npm run db:up` | `docker compose up -d --wait` |
| `npm run db:migrate` | `prisma migrate deploy` on `DATABASE_URL` |
| `npm run db:seed` | Upsert the two loan plans (idempotent) |
| `npm run db:reset` | Drop, migrate and seed the dev DB (**destroys dev data**) |
| `npm run prisma -w apps/api -- <args>` | Any Prisma CLI command with the root `.env` loaded, e.g. `-- studio` or `-- migrate dev --name x` |

## API reference

Base path `/api/v1`, JSON only. Every non-2xx response, without exception, has this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid",
             "fields": [ { "field": "netWeightGrams", "message": "Net weight cannot be more than gross weight" } ],
             "details": { } } }
```

`fields` is always present (empty if not field-specific); `details` only when there is extra context.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body fails the shared Zod schema (one message per field) |
| `INVALID_JSON` | 400 | Malformed JSON body |
| `PLAN_NOT_FOUND` | 404 | Plan missing or inactive (field `planId`) |
| `ROUTE_NOT_FOUND` | 404 | Unknown route |
| `PENDING_NOT_FOUND` | 404 | Chat confirmation unknown, already used or expired |
| `DUPLICATE_APPLICATION` | 409 | Same mobile applied in the last 7 days (`details.existingApplicationId`, `existingSubmittedAt`) |
| `QUOTE_CHANGED` | 409 | Chat confirm: the quote changed since the summary was shown (`details.pendingConfirmation` has the new one) |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 100 kB |
| `INTERNAL_ERROR` | 500 | Anything unexpected: generic message, never a stack trace or database text (logged server-side) |
| `GOLD_RATE_UNAVAILABLE` | 503 | Gold rate source invalid or down |
| `AGENT_UNAVAILABLE` | 503 | No LLM key, or every configured model failed |

### `GET /loan-schemes`

```bash
curl -s localhost:4000/api/v1/loan-schemes
```
```json
{ "data": [
  { "id": "PLAN_BULLET_01", "name": "Bullet Repayment", "annualInterestRate": 12, "tenureMonths": 12, "maxLtv": 0.7,
    "repaymentType": "BULLET", "description": "Interest + principal at maturity" },
  { "id": "PLAN_EMI_01", "name": "Monthly EMI", "annualInterestRate": 10.5, "tenureMonths": 12, "maxLtv": 0.75,
    "repaymentType": "EMI", "description": "Equal monthly instalments" } ] }
```

### `POST /quotes`: pure calculation, no database write

```bash
curl -s -X POST localhost:4000/api/v1/quotes -H 'Content-Type: application/json' \
  -d '{"netWeightGrams":45,"grossWeightGrams":50,"karat":22}'
```
```json
{ "data": { "input": { "netWeightGrams": 45, "grossWeightGrams": 50, "karat": 22 },
  "rate24kPerGram": 7000, "pureGoldGrams": 41.25, "goldValueRupees": 288750, "goldValuePaise": 28875000,
  "plans": [
    { "planId": "PLAN_BULLET_01", "planName": "Bullet Repayment", "appliedLtv": 0.7, "eligibleLoan": 202125,
      "annualInterestRate": 12, "tenureMonths": 12, "repaymentType": "BULLET" },
    { "planId": "PLAN_EMI_01", "planName": "Monthly EMI", "appliedLtv": 0.75, "eligibleLoan": 216562,
      "annualInterestRate": 10.5, "tenureMonths": 12, "repaymentType": "EMI" } ] } }
```

### `POST /leads`: create a lead (201)

```bash
curl -s -X POST localhost:4000/api/v1/leads -H 'Content-Type: application/json' \
  -d '{"fullName":"Ravi Kumar","mobileNumber":"9876543210","grossWeightGrams":50,"netWeightGrams":45,"karat":22,"planId":"PLAN_EMI_01"}'
```
```json
{ "data": { "applicationId": "GL-1001", "status": "SUBMITTED", "createdAt": "2026-10-28T06:30:00.000Z",
  "fullName": "Ravi Kumar", "mobileNumber": "9876XXXX10", "netWeightGrams": 45, "grossWeightGrams": 50,
  "karat": 22, "planId": "PLAN_EMI_01", "planName": "Monthly EMI",
  "pureGoldGrams": 41.25, "goldValueRupees": 288750, "appliedLtv": 0.75, "eligibleLoan": 216562 } }
```

Order of checks: Zod validation (400) → plan exists and is active (404) → same mobile in the last 7 days (409) →
**server-side recalculation** with the current rate and the plan's LTV from the database → insert. Any money
fields the client sends (`eligibleLoan`, `goldValueRupees`, `appliedLtv`, `status`, …) are stripped by Zod and
never read. The lead stores **snapshots** of the numbers, so they never change later.

The same mobile again within 7 days:
```json
{ "error": { "code": "DUPLICATE_APPLICATION",
  "message": "An application from this mobile number was already submitted in the last 7 days.",
  "fields": [ { "field": "mobileNumber", "message": "Already applied in the last 7 days" } ],
  "details": { "existingApplicationId": "GL-1001", "existingSubmittedAt": "2026-10-28T06:30:00.000Z" } } }
```

### `GET /leads[?planId=PLAN_EMI_01]`

```bash
curl -s 'localhost:4000/api/v1/leads?planId=PLAN_EMI_01'
```
Returns `{ "data": [ …lead DTOs, newest first, mobiles masked… ], "meta": { "total": n } }`. Stored snapshots,
never recalculated.

### Loan Assist: `POST /chat`, `/chat/confirm`, `/chat/cancel`

```bash
curl -s -X POST localhost:4000/api/v1/chat -H 'Content-Type: application/json' \
  -d '{"message":"I have 45 g of 22K gold, gross 50 g. How much can I get?"}'
# → { "sessionId": "…", "messages": [{ "role": "assistant", "content": "…₹2,16,562…" }],
#     "toolEvents": [{ "tool": "calculate_quote", "status": "ok", "result": { "quote": { … } } }] }

# After submit_application, the response carries "pendingConfirmation": { "pendingId", "summary" }.
curl -s -X POST localhost:4000/api/v1/chat/confirm -H 'Content-Type: application/json' \
  -d '{"sessionId":"<sessionId>","pendingId":"<pendingId>"}'
# → 201 with "outcome": { "status": "CREATED", "lead": { "applicationId": "GL-1002", … } }
#   200 with "outcome": { "status": "FAILED", "error": { "code": "DUPLICATE_APPLICATION", … } } (final errors)
#   409 QUOTE_CHANGED (new pendingConfirmation), 404 PENDING_NOT_FOUND, or 5xx with details.retryable = true
```

`message` is 1–1000 characters. The browser only ever sends `sessionId` + text (or ids); conversation history
and tool results live on the server, so a client cannot forge them.

## Money maths and rounding

All money maths lives in [`apps/api/src/lib/money.ts`](apps/api/src/lib/money.ts):

```
pureGoldGrams = netWeightGrams × karat / 24
goldValue     = pureGoldGrams × rate24kPerGram
eligibleLoan  = floor(goldValue × min(plan.maxLtv, 75%))
```

- **Integers only, in BigInt:** weights in milligrams, the rate in paise per gram, LTV in basis points. Weights
  are parsed from their **decimal string** (at most 3 decimals), never by multiplying a float by 1000. A number
  input is first normalised to 15 significant digits, so `0.1 + 0.2` becomes `0.3`, while a real `12.3456`
  is still rejected.
- **Eligible loan** = `floor(netMg × karat × ratePaise × ltvBps / (24 × 1000 × 10000 × 100))`, whole rupees,
  computed from the **exact** fraction with a single division, never from a rounded gold value.
- **Pure gold** is rounded half-up to 3 decimals (the milligram); **gold value** is rounded half-up to the paisa
  (`goldValuePaise` integer, `goldValueRupees` with 2 decimals).
- Rounded figures are for display and snapshots only; nothing is calculated from them.
- LTV can never exceed 75%: a database CHECK (`maxLtvBps <= 7500`), the seed's Zod schema, and
  `min(maxLtvBps, 7500)` in the maths. A sanity guard after every quote (loan ≤ 75% of value, LTV ≤ 75%,
  safe integer) returns a 500 rather than ever storing a bad number.
- Naive JavaScript gets `Math.floor(1 × (18/24) × 7000 × 0.7)` = **3674**; the correct answer is **3675**. This
  exact case, all the spec's vectors, and a 2,400-case comparison against an independent BigInt implementation
  are in [`money.test.ts`](apps/api/test/money.test.ts).

## Architecture

```
          Web form (React)                    Loan Assist chat (React)
                │                                      │
     POST /quotes, POST /leads              POST /chat, /chat/confirm, /chat/cancel
                │                                      │
         routes (thin: parse → service → respond)   agentService ── LLM (OpenAI-compatible, model chain)
                │                                      │   tools: get_loan_schemes · calculate_quote · submit_application
                └──────────────┬───────────────────────┘
                               ▼
      services: schemeService · quoteService.calculate() · leadService.create()   ← single source of truth
                               ▼
              lib/money.ts (BigInt maths) · Prisma → PostgreSQL (CHECK constraints)
```

- **One service layer.** `POST /quotes` and the `calculate_quote` tool call the same `quoteService.calculate()`.
  `POST /leads` and `/chat/confirm` call the same `leadService.create()`, which validates, checks the plan, checks
  duplicates, **recalculates**, then inserts. A test proves a lead from the agent stores exactly the same numbers
  as a form lead for the same input.
- **Shared schemas.** [`packages/shared`](packages/shared/src/schemas.ts) holds the Zod schemas, error messages,
  response types and formatters. The form validates as you type, the API validates requests, and the agent's
  tool JSON Schemas are generated from them.
- **The browser never computes money.** It only displays server numbers, and mobiles from the API are always masked.
- **Errors:** routes throw `AppError`s; a single error handler writes the contract above; 500s never carry internals.
- **Data integrity:** CHECK constraints (LTV ≤ 75%, net ≤ gross ≤ 1000 g, karat ∈ {18, 22, 24}), application ids
  `GL-1001…` from a Postgres-generated column, snapshots of every number on the lead.

## Loan Assist (agent) design

Code: [`apps/api/src/agent/`](apps/api/src/agent/).

- **Tools** (JSON Schemas generated from the shared Zod schemas with `z.toJSONSchema`):
  - `get_loan_schemes`: the active plans.
  - `calculate_quote`: the same `quoteService.calculate()` as `POST /quotes`. Results also carry display strings
    such as `"₹2,16,562"` so the model copies numbers rather than formatting them.
  - `submit_application`: validates with the lead schema, checks the plan, quotes it, and stores a **single-use
    pending item** (10-minute expiry) on the server. **It never writes to the database.**
- **Confirmation gate.** A lead is created only when the user presses **Confirm & submit** on the card in the UI
  (`/chat/confirm`), never because the model said so. This is the only place an AI-driven action becomes a record,
  so a human has to see the full summary and agree. Confirm:
  - takes a synchronous lock (a double click can't create two leads);
  - re-quotes and compares with the summary the user saw (rate, LTV, loan); if anything changed it returns
    `409 QUOTE_CHANGED` with a new summary, so nobody is filed for numbers they didn't see;
  - calls `leadService.create(…, { channel: "AGENT" })`;
  - final errors (400/404/409) use up the pending item and the model explains them; temporary errors (5xx) keep it
    valid so the user can press Confirm again.
- **Guardrails** ([`systemPrompt.ts`](apps/api/src/agent/systemPrompt.ts)): gold loans only; never calculate or
  estimate, so every number comes from a tool; only describe plans returned by tools; ask for missing details
  (never assume the two weights are equal); no investment advice and no promises of approval; user text is data,
  not instructions; reply in the user's language (English/Hindi/Hinglish) as plain short text.
- **Server-side checks that don't rely on the model:** at most 5 tool round-trips per message; unknown tools return
  an error result; tool errors go back to the model as `{ ok: false, error }` (a 500 only ever as the generic
  message); a reply after a failed confirm that claims "submitted" is replaced with a safe template.
- **App events.** The result of Confirm/Cancel is added to the conversation as a message starting with
  `[App event]`. That marker is removed from anything the user types, so it can't be forged.
- **Privacy.** Mobile numbers are masked in every API response and in all logs (pino redaction plus a final
  `maskMobilesInText` pass over every log line, which also covers error messages and URLs). Chat text is logged
  (masked) only outside production. The LLM key never leaves the server.
- **Sessions:** in memory, 30-minute idle timeout (fine for one API process; see "more time").

## LLM used and how to switch providers

**Default: Google Gemini** through its OpenAI-compatible endpoint, because it has a free tier, supports tool
calling and is reachable with the standard `openai` SDK. `temperature: 0`.

`LLM_MODEL` is a **comma-separated chain, best first**:
`gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite`.

- If a model is **rate-limited (429)**, overloaded (5xx), **times out (25 s)**, or isn't available to your key
  (403/404), the **same request** goes to the next model. The conversation history is stored in a
  provider-neutral form, so any model can continue it, even halfway through a turn.
- That model then sits out a cool-down (Google's `retryDelay` for rate limits, otherwise 1–60 minutes depending on
  the error), and the best model is tried again once it ends. A 400/401 is not retried (no model would accept it).
- Gemini 3 "thought signatures" on tool calls are passed back unchanged (required by Gemini 3).
- `gemini-2.5-*` is closed to new API keys and Pro models have a free-tier limit of 0, so they aren't in the
  default chain. Any model your key can use works.

**Switch provider** by changing three variables (no code change):

```bash
# Groq
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile

# Ollama (local, no key needed)
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.1
```

## Tests

`npm test` runs **324 tests** with no LLM needed: shared 96, API 173, web 55. `npm run eval` runs the **5 real-LLM
conversations**, described in [`docs/test-conversations.md`](docs/test-conversations.md).

### Spec test cases → automated tests

| Case | What | Test (file › name) |
|---|---|---|
| 1 | 45 g / 22K / EMI → 216562 | `apps/api/test/leads.test.ts` › `case 1: 45 g / 22K / EMI → 201 with server numbers` |
| 2 | Same input, Bullet → 202125 | `leads.test.ts` › `case 2: same input with PLAN_BULLET_01 → 202125` |
| 3 | 10 g / 18K / EMI → 39375 | `leads.test.ts` › `case 3: 10 g / 18K / EMI → 39375` |
| 4 | Net 52 > gross 50 → 400 on `netWeightGrams` | `leads.test.ts` › `case 4: …`; also `quotes.test.ts` and `packages/shared/test/schemas.test.ts` (`test case 4`) |
| 5 | Mobile `5876543210` / `98765` → 400 on `mobileNumber` | `leads.test.ts` › `case 5: mobile %s → 400 on mobileNumber`; also `schemas.test.ts` (`test case 5`) |
| 6 | Same mobile twice → 409 with the first id | `leads.test.ts` › `case 6: same mobile twice → 409 pointing at the first application` |

### Also covered

- **Money:** every vector in the spec, the 3674/3675 float trap, the 80% plan capped to 75%, half-up ties,
  "loan from the exact value", and 2,400 cases against an independent reference (`money.test.ts`).
- **API:** the error contract (unknown route, malformed JSON, oversized body, async throw → generic 500 with no
  stack), client money fields ignored (stored and returned 216562 even if the client sends 99999999),
  recalculation failures write nothing (503 / 500), deactivated plans, the exact 7-day boundary, newest-first
  ordering, masked mobiles (`errors.test.ts`, `quotes.test.ts`, `leads.test.ts`, `leadFailures.test.ts`, `db.test.ts`).
- **Agent without an LLM** (a scripted fake model): `submit_application` never writes; confirm creates one AGENT
  lead with the same numbers as the form; single-use, expiry and double-click; QUOTE_CHANGED; 503/500 at confirm;
  internal errors never reach the model; logs never contain a raw mobile; tool schemas match the shared
  constraints; model fallback and cool-downs (`apps/api/test/agent/`).
- **Web:** step-1 validation as you type, the debounced quote (one request after rapid typing; stale responses
  ignored), plan cards, confirm and every error case (400/404/409/503), the admin table and filter, the "never
  unmask" guard, accessibility (focus management, live regions, skip link, offline banner) and the chat panel.
- **Manual checks:** axe-core (WCAG 2.1 AA) found 0 violations on 30 page states at 375 / 768 / 1280 px; a
  keyboard-only walkthrough of all three steps works.

## Bonus attempted

_None yet._

## What I'd do with more time

- **Race-safe duplicate check** (bonus B1): the 7-day check is a read before the insert, so two simultaneous
  requests for a new mobile could both pass. A transaction with `pg_advisory_xact_lock(hashtext(mobile))` would fix it.
- **Durable chat sessions:** sessions are in memory, so an API restart loses conversations and they don't work
  across several API instances. Postgres or Redis would fix both.
- **A second LLM provider as the last fallback** (e.g. Groq or a local Ollama), so a free-tier quota running out on
  Gemini doesn't stop the chat.
- **Streaming replies (SSE)** and tool-status chips ("Calculating quote…"): some Gemini turns take 10–30 s.
- **More evals:** Hinglish, the user changing their mind, prompt injection, quote changed during confirm.
- `docker compose up` for the whole stack, and CI running typecheck + tests against a Postgres service container.

## Where I got stuck

- **Gemini model availability.** The spec's `gemini-2.5-flash` returns 404 for new API keys, the newest models
  (3.7/3.8-flash) were often overloaded, and the free tier's daily quota ran out during testing. I tried each model
  on my key with a real tool call, then built the fallback chain with cool-downs. The evals pass even when the 4th
  model in the chain is answering.
- **Gemini 3 thought signatures.** The follow-up call after a tool call failed until the provider's extra fields on
  each tool call were sent back unchanged.
- **Confirm results sent as system messages got empty replies on Gemini.** Its OpenAI layer folds system messages
  into the instructions, so the model saw nothing new to answer. App events are now user-role messages with an
  unforgeable marker. The first eval run caught this.
- **Zod v4 refinements.** By default an object-level check (net ≤ gross) is skipped while another field has a type
  error, so the form couldn't show "net > gross" until everything else was filled. Fixed with `superRefine(…, { when })`.
- **Environment confusion:** a VS Code setting copies `.env` into terminals when they open, so `.env` edits seemed
  to be ignored (see the note in Quick start).
