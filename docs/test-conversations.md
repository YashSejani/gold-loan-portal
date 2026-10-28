# Loan Assist test conversations

The agent is tested at two levels:

- **`npm test`** (no LLM, always runs): a scripted fake model drives the real tools, services and test
  database. It covers the hard guarantees: `submit_application` never writes a lead, a confirmation is
  single-use and expires, a double click creates one lead, internal errors never reach the model, mobile
  numbers never reach the logs. See `apps/api/test/agent/`.
- **`npm run eval`** (real LLM, needs `LLM_API_KEY`): the five conversations below, in
  `apps/api/evals/conversations/*.json`, run against the real model and the **test** database. They check
  the model's *behaviour*: which tools it calls, what it asks for, and that every number it says came from a tool.

## How the runner works

`apps/api/evals/runEvals.ts`:

1. Switches `DATABASE_URL` to `DATABASE_URL_TEST` before loading any database code (and refuses to run if
   they are the same), applies migrations and seeds the two plans.
2. For each conversation: empties the `Lead` table, re-activates the plans, applies `setup.seedLeads`
   (created through `leadService.create`, then back-dated), and starts a fresh session.
3. Plays the steps: `{ "user": "…" }` sends a chat message; `{ "action": "confirm" | "cancel" }` presses the
   button on the latest confirmation card (the same `agentService.confirm` the `/chat/confirm` route calls).
4. Checks the expectations, prints a PASS/FAIL table (with a masked transcript for failures), waits
   `EVAL_DELAY_MS` between conversations and exits with code 1 if anything failed.

`npm run eval -- happy` runs only the conversations whose id contains `happy`.

### Expectation keys

| Key | Meaning |
|---|---|
| `toolsCalled` / `toolsNotCalled` | Tool names that must / must not appear in the session's tool events |
| `toolErrors` | `[{ tool, field }]`: that tool returned `ok:false` with an error on that field |
| `pendingConfirmation` | Whether a confirmation card was shown at any point |
| `leadCreated` | Whether the conversation created a lead (seeded leads don't count) |
| `leadMatches` | Columns of the created lead in the database, e.g. `eligibleLoanRupees`, `channel` |
| `replyMatches` / `replyNotMatches` | Case-insensitive regexes for the **last** reply (or, inside a step's `expect`, that step's reply) |
| `numbersGrounded` | Every `₹`/`Rs` amount and every gram figure in **any** reply appears in a tool result or server outcome of the session (including display strings such as `₹2,16,562`) |

A step can carry its own `expect` (`toolsCalled`, `toolsNotCalled`, `replyMatches`, `replyNotMatches`) to
check one specific turn.

## The five conversations

### 1. Happy path (`01-happy-path`)
- **User:** "I have 45 grams of 22 carat jewellery, how much can I get?" → "The gross weight is 50 grams." →
  "I'll go with the Monthly EMI plan." → name + mobile → presses **Confirm**.
- **Expected:** `calculate_quote` is called once the gross weight is known; `submit_application` after the name
  and mobile; a confirmation card is shown; Confirm creates exactly one lead with `channel = AGENT`,
  `PLAN_EMI_01`, 45 g / 50 g / 22K, `eligibleLoanRupees = 216562`, `goldValuePaise = 28875000` (the same numbers
  the form produces for that input); the final reply gives the `GL-` application id; every ₹ and gram figure
  the model said is grounded in a tool result.

### 2. Missing field (`02-missing-field`)
- **User:** "I have 45 grams of 22 carat gold. How much loan can I get?" (no gross weight)
- **Expected:** the agent asks for the gross weight; it does not call `submit_application`, shows no
  confirmation card and creates no lead; any number it mentions is grounded.

### 3. Net weight above gross weight (`03-net-greater-than-gross`)
- **User:** "My jewellery is 52 grams net and 50 grams gross, 22 karat. How much can I get?"
- **Expected:** `calculate_quote` returns a validation error on `netWeightGrams` (the shared Zod rule);
  the reply explains that net weight cannot be more than gross and asks for the correct weights; no ₹ amount,
  no card, no lead.

### 4. Duplicate within 7 days (`04-duplicate`)
- **Setup:** a lead for 9876543210 created 2 days ago (it becomes `GL-1001`).
- **User:** gives every detail in one message → presses **Confirm**.
- **Expected:** `submit_application` shows a card; Confirm is rejected by `leadService.create` with
  `DUPLICATE_APPLICATION`, so **no new lead**; the reply names the existing application `GL-1001` and never
  says the application was submitted.

### 5. Off-topic (`05-off-topic`)
- **User:** "Write a poem about cricket", then "Should I buy Bitcoin?"
- **Expected:** both are declined politely and steered back to gold loans (each reply mentions gold); no
  cricket poem, no investment advice; no tool is called, no card, no lead.

## Results

Latest run (two consecutive runs, both 5/5). Your numbers will differ slightly: the replies come from a real model.

```
id                         title                                                 result  time    reason
01-happy-path              Quote, pick EMI, apply, confirm                       PASS     35.6s  all expectations met
02-missing-field           Missing gross weight: agent asks, does not submit     PASS      1.7s  all expectations met
03-net-greater-than-gross  Net 52 g > gross 50 g: tool error, agent asks to fix  PASS      1.8s  all expectations met
04-duplicate               Applied 2 days ago: confirm reports the existing id   PASS      4.4s  all expectations met
05-off-topic               Poem and Bitcoin advice: polite decline, no tools     PASS      2.4s  all expectations met
5/5 passed
```

During these runs `gemini-3.8-flash` was overloaded and `gemini-3.6-flash` / `gemini-3.5-flash` were
rate-limited on the free tier, so the model chain fell back and most turns were answered by
`gemini-3.5-flash-lite`. The evals passing on the 4th-choice model is a useful result in itself.

## What the first run caught (and what was fixed)

The first run was 3/5. Both failures were agent problems, so the agent was fixed and the expectations kept:

1. **Missing field:** given only "45 grams of 22 carat", the model assumed gross = net and quoted a loan.
   The prompt said "do not guess missing values", which was too vague. **Fix (prompt):** a quote needs both
   weights; if one is missing, ask for it; never assume they are equal.
2. **Duplicate:** the confirm itself was correct (no new lead, `DUPLICATE_APPLICATION`), but the model's reply
   was empty, so the user saw a generic "Sorry, I couldn't finish that". Cause: the Confirm result was sent as
   a *system* message, which Gemini's OpenAI-compatible layer folds into its system instructions, leaving the
   model nothing new to answer. **Fix (agent):** app events are sent as user-role messages starting with
   `[App event]`. The marker is neutralised in anything the user types, so it can't be forged. If the model
   still returns nothing, the safe template reply is used. Unit tests cover both.
