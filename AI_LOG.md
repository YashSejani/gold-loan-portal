# AI_LOG

## Tools used and for what

- **Claude (web chat): planning, about 2 hours before writing any code.** I used it to work through the
  assignment PDF and design the whole architecture: the monorepo layout, the single service layer shared by the
  form and the agent, exact money maths with integers/BigInt, the API and error contract, the database design,
  and the agent's confirmation gate. From that chat I wrote:
  - **[`CLAUDE.md`](CLAUDE.md)**: a detailed spec and rulebook for the coding agent (stack, business rules, test vectors,
    API contract, agent rules, privacy, deliverables). It is the "single source of truth" in this repo.
  - **[`PROMPTS.md`](PROMPTS.md)**: the phase-by-phase prompts I then gave to Claude Code.
- **Claude Code: implementation.** I built the project one phase at a time (scaffold → database → money maths →
  validation → API → web form → agent → chat UI → evals → docs), using the prompts from [`PROMPTS.md`](PROMPTS.md). For each
  phase I asked for tests first on maths and validation, reviewed the output, ran the app and the tests myself,
  and only then committed.
- **Gemini (Google AI Studio API)** is not a development tool here: it is the LLM that runs inside the app for
  Loan Assist (through the OpenAI-compatible endpoint).

## Prompt 1: validation (exact)

```text
Phase 3: validation (CLAUDE.md §4.3). Shared schemas only; no routes yet.

In packages/shared/src/schemas.ts create Zod v4 schemas, using the exact field names and
error messages from §4.3:
- weightFields + karat → QuoteRequestSchema { netWeightGrams, grossWeightGrams, karat }
  with superRefine: net <= gross, error path ['netWeightGrams'].
- LeadRequestSchema = fullName, mobileNumber, grossWeightGrams, netWeightGrams, karat, planId,
  optional channel ('FORM' | 'AGENT'); strip unknown keys; ignore any client money fields.
- fullName: trim, 2–60 chars, ^[A-Za-z]+( [A-Za-z]+)*$
- mobileNumber: string ^[6-9]\d{9}$ (reject numbers, spaces, +91 prefix; the UI strips spaces)
- weights: number, > 0, <= 1000, max 3 decimal places (check via string form, not float maths)
- karat: integer literal union 18 | 22 | 24 (accept numeric strings "22" from forms → coerce safely)
Export inferred types, and a helper zodToFields(error) → [{ field, message }] used by the API
error handler and the web form.
Also packages/shared/src/format.ts: maskMobile ("9876543210" → "9876XXXX10"), formatINR (en-IN,
₹2,16,562), formatDateShortIST ("3 Oct" in Asia/Kolkata), maskMobilesInText (regex in §9.5).

Tests (packages/shared/test): every rule with valid + invalid cases, including:
- net 52 > gross 50 → one field error on netWeightGrams (test case 4)
- mobile "5876543210" and "98765" → field error on mobileNumber (test case 5)
- name "A", 61 chars, "Ravi123", "Ravi  Kumar" (double space) rejected; "Ravi Kumar" ok
- weights 0, -1, 1000.0001, 1000 (ok), 1.2345 (rejected), karat 20 and 23 rejected
- maskMobile, formatINR(216562) === "₹2,16,562", maskMobilesInText on a sentence.
Run tests, show output.
```

## Prompt 2: agent tools (exact)

```text
Phase 11: Loan Assist agent backend. Read CLAUDE.md §9 fully before planning. Plan first.

1. agent/llmClient.ts: openai SDK with LLM_BASE_URL / LLM_API_KEY / LLM_MODEL, temperature 0,
   a small interface chat(messages, tools) so providers are swappable. Clear startup warning if
   LLM_API_KEY is missing (the rest of the app must still work).
2. agent/tools.ts: three tools with JSON Schemas generated from the SHARED Zod schemas
   (z.toJSONSchema). Handlers:
   - get_loan_schemes → schemeService.listActive()
   - calculate_quote({ netWeightGrams, grossWeightGrams, karat }) → QuoteRequestSchema.safeParse →
     quoteService.calculate (the same function as POST /quotes)
   - submit_application(payload) → LeadRequestSchema.safeParse → schemeService.getActiveById →
     quoteService for that plan → store a single-use pending submission { pendingId, payload,
     summary, expiresAt = now + 10 min } in the session → return
     { status: "PENDING_USER_CONFIRMATION", summary }. It must NOT create a lead.
   Invalid args or service errors → return { ok: false, error: { code, message, fields } } to the
   model (never throw), so it can ask the user to fix the specific field.
3. agent/sessionStore.ts: in-memory Map sessionId → { messages, pending, lastActive }, 30-min TTL.
4. agent/agentService.ts: handleUserMessage(sessionId, text) runs the tool loop (max 5 tool
   round-trips, unknown tool → error result) and returns { sessionId, messages, toolEvents,
   pendingConfirmation? }. confirm(sessionId, pendingId) → leadService.create(payload,
   { channel: "AGENT" }) (THE SAME function POST /leads uses), append the result (lead or
   409/404/400 error) as context, get the model's final reply. cancel(sessionId, pendingId).
   Pending ids are single-use and expire.
5. agent/systemPrompt.ts with every rule in §9.4.
6. routes/chat.ts: POST /api/v1/chat, /chat/confirm, /chat/cancel with Zod-validated bodies
   (message 1–1000 chars). Errors use the same error contract.
7. Privacy: chat text and tool args are logged only through maskMobilesInText; no key ever sent to
   the web.
Unit tests WITHOUT a real LLM (inject a fake llmClient that returns scripted tool calls):
- submit_application never writes a Lead (count before == after) and returns PENDING_USER_CONFIRMATION
- confirm creates exactly one lead with channel AGENT and the SAME numbers as POST /leads for the
  same input; confirming the same pendingId twice fails; an expired pendingId fails
- calculate_quote with net > gross returns ok:false with field netWeightGrams
- unknown tool name → error result, loop stops after 5 round-trips
- logs captured during a chat containing 9876543210 never contain that string
- error paths (CLAUDE.md §9.2 "Errors on the agent path"):
  · submit_application when quoteService throws (plan deactivated → 404) → ok:false to the model, no pending
  · plan deactivated BETWEEN submit_application and confirm → confirm returns 404, no lead, pending consumed,
    final reply doesn't contain "submitted"
  · quoteService throws 503 at confirm → no lead, pending still valid, a second confirm after recovery creates one lead
  · gold rate changed between submit_application and confirm → 409 QUOTE_CHANGED with a new pendingId, no lead;
    confirming the new pendingId creates the lead with the new numbers
  · a 500 at confirm never puts the internal error text into the model's messages
```

## Where the AI was wrong

**The net ≤ gross validation produced a wrong, misleading error.** In Phase 3 the AI wrote the "net weight cannot
be more than gross weight" rule as an object-level `superRefine` in the shared Zod schema, assuming it would only
run once both weights were valid. In Zod v4 that isn't true: the object-level check still runs after a field has
already failed its own checks. So for **gross weight 0** the schema returned the correct gross-weight error *and*
a second, misleading "Net weight cannot be more than gross weight" error, because 0.001 g net is "more than" an
invalid 0 g gross. The user would be told to fix a field that wasn't wrong.

**Fix:** the net ≤ gross comparison now only runs when both weights are valid on their own. A later phase found
the opposite side of the same Zod behaviour: when *another* field had a type error (for example, the name was
still empty), Zod skipped the check entirely, so the form couldn't show "net > gross" until everything else was
filled in. That was fixed with `superRefine(…, { when })`.

## How I spotted it

From the test run: the first green run was **81/82**. The test "rejects gross weight 0" expected exactly one error,
on `grossWeightGrams`, and got a second one on `netWeightGrams`. Because the tests compare the **complete** list of
field errors, not just "contains this error", the extra misleading message made the test fail instead of slipping through.

## The test that catches it

- `packages/shared/test/schemas.test.ts` › **`QuoteRequestSchema` › `rejects gross weight 0`** (part of `rejects gross
  weight %s`): fails if the invalid gross weight also produces a net > gross error.
- `packages/shared/test/schemas.test.ts` › **`net <= gross with other fields still invalid`**: fails if the check is
  skipped while other fields are still empty or invalid.

## Other places I corrected or extended the AI's plan

**1. Planning: what happens when the server-side recalculation fails.** The PDF says `POST /api/v1/leads`
"validates, re-computes the quote server-side (never trust client numbers), de-duplicates, stores the lead with
status SUBMITTED and returns 201 with an applicationId". The plan covered recalculating on the server, but not what
happens when that recalculation fails. I asked: what if `quoteService.calculate()` returns an error? That can
happen on the agent's submit path too. This became explicit rules in `CLAUDE.md` (§6 "When the recalculation
fails" and §9.2 "Errors on the agent path"):
- nothing is ever written if the quote throws;
- final errors (400/404/409) use up the agent's pending confirmation, while temporary ones (500/503) keep it valid;
- confirm re-quotes and returns `QUOTE_CHANGED` if the numbers moved, so a user is never filed for numbers they didn't see.

Tests: `apps/api/test/leadFailures.test.ts`, `apps/api/test/agent/agentFailures.test.ts`.

**2. Agent: one model is a single point of failure.** I'm using a free Gemini key, and the AI set Loan Assist up
with one model. From previous projects I knew a free-tier key hits its rate limit, and then that model simply stops
answering. So I asked for a **list of models**: if one is rate-limited or unavailable, the same conversation moves
to the next one. This turned out to matter straight away:
- the default `gemini-2.5-flash` returned 404 for new API keys;
- the newest models were overloaded;
- my free-tier quota on the better models ran out during testing.

With the fallback chain, the evals still passed while a lighter model was answering. `LLM_MODEL` is now a
comma-separated list (best first); a model that hits a limit sits out a cool-down and the best one is tried again later.

Tests: `apps/api/test/agent/modelFallback.test.ts`.
