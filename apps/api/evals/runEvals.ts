// Agent evals (CLAUDE.md §9.6): scripted conversations against the REAL LLM, in-process, on the TEST database.
// Usage: npm run eval            (all conversations)
//        npm run eval -- happy   (only conversations whose id contains "happy")
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ---- 1. Point everything at the test database BEFORE any module creates a Prisma client ----
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) fail('DATABASE_URL_TEST is not set (copy .env.example to .env).');
if (testUrl === process.env.DATABASE_URL) fail('DATABASE_URL_TEST must differ from DATABASE_URL: evals empty the leads table.');
process.env.DATABASE_URL = testUrl;
if (!process.env.LLM_API_KEY) fail('LLM_API_KEY is not set: evals need a real model (see README).');

const { maskMobilesInText } = await import('@goldloan/shared');
const { createAgentService } = await import('../src/agent/agentService');
const { createOpenAiLlmClient } = await import('../src/agent/llmClient');
const { createSessionStore } = await import('../src/agent/sessionStore');
const { config } = await import('../src/config');
const { prisma } = await import('../src/db');
const { createLogger } = await import('../src/logger');
const leadService = await import('../src/services/leadService');
const { seedPlans } = await import('../prisma/plans');

// ---- 2. Conversation file schema ----
const Expectations = z.object({
  toolsCalled: z.array(z.string()).optional(),
  toolsNotCalled: z.array(z.string()).optional(),
  /** Tool calls that must have returned ok:false with an error on this field. */
  toolErrors: z.array(z.object({ tool: z.string(), field: z.string() })).optional(),
  pendingConfirmation: z.boolean().optional(),
  leadCreated: z.boolean().optional(),
  /** Columns of the lead the agent created (DB row), e.g. { eligibleLoanRupees: 216562, channel: "AGENT" }. */
  leadMatches: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  /** Regexes (case-insensitive) the reply must / must not match: the last reply, or that step's reply. */
  replyMatches: z.array(z.string()).optional(),
  replyNotMatches: z.array(z.string()).optional(),
  /** Every ₹ amount and gram figure in the replies appears in a tool result of the session. */
  numbersGrounded: z.boolean().optional(),
});
const StepExpectations = Expectations.pick({ toolsCalled: true, toolsNotCalled: true, replyMatches: true, replyNotMatches: true });

const Conversation = z.object({
  id: z.string(),
  title: z.string(),
  setup: z
    .object({
      seedLeads: z
        .array(z.object({ daysAgo: z.number().nonnegative(), lead: z.record(z.string(), z.unknown()) }))
        .optional(),
    })
    .optional(),
  steps: z
    .array(
      z.union([
        z.object({ user: z.string().min(1), expect: StepExpectations.optional() }),
        z.object({ action: z.enum(['confirm', 'cancel']), expect: StepExpectations.optional() }),
      ]),
    )
    .min(1),
  expect: Expectations,
});
type Conversation = z.infer<typeof Conversation>;
type StepExpect = z.infer<typeof StepExpectations>;

// ---- 3. Test database + one shared model chain (so cool-downs carry over between conversations) ----
const apiDir = fileURLToPath(new URL('..', import.meta.url));
execSync('npx prisma migrate deploy', { cwd: apiDir, env: { ...process.env, DATABASE_URL: testUrl }, stdio: 'pipe' });
await seedPlans(prisma);

const llm = createOpenAiLlmClient(config.llm, {
  onFallback: ({ model, reason, next }) => console.log(`   · ${model} ${reason}${next ? `, falling back to ${next}` : ', no models left'}`),
});
const silent = createLogger({ level: 'silent' });
const originalRate = config.goldRate24kPaisePerGram;

// ---- 4. Run ----
interface Transcript {
  lines: string[];
  replies: string[];
  toolsCalled: Set<string>;
  toolErrors: Array<{ tool: string; fields: string[] }>;
  /** Everything a tool or the server returned during the session (for numbersGrounded). */
  facts: unknown[];
  pendingSeen: boolean;
}

async function runConversation(conversation: Conversation): Promise<string[]> {
  await prisma.$executeRawUnsafe('TRUNCATE "Lead" RESTART IDENTITY CASCADE');
  await prisma.loanScheme.updateMany({ data: { isActive: true } });
  config.goldRate24kPaisePerGram = originalRate;

  for (const { lead, daysAgo } of conversation.setup?.seedLeads ?? []) {
    const created = await leadService.create(lead, { channel: 'FORM' });
    await prisma.lead.update({
      where: { applicationId: created.applicationId },
      data: { createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) },
    });
  }
  const seededCount = await prisma.lead.count();

  const agent = createAgentService({ llm, store: createSessionStore(), logger: silent, logChatText: false });
  const t: Transcript = { lines: [], replies: [], toolsCalled: new Set(), toolErrors: [], facts: [], pendingSeen: false };
  const failures: string[] = [];
  let sessionId: string | undefined;
  let pendingId: string | undefined;

  for (const [index, step] of conversation.steps.entries()) {
    const stepTools = new Set<string>();
    let reply = '';
    try {
      if ('user' in step) {
        t.lines.push(`user: ${step.user}`);
        const response = await agent.handleUserMessage(sessionId, step.user);
        sessionId = response.sessionId;
        for (const event of response.toolEvents) {
          stepTools.add(event.tool);
          t.toolsCalled.add(event.tool);
          t.facts.push(event.result);
          if (event.status === 'error') {
            const fields = ((event.result as { fields?: Array<{ field: string }> })?.fields ?? []).map((f) => f.field);
            t.toolErrors.push({ tool: event.tool, fields });
          }
          t.lines.push(`  [tool] ${event.tool}: ${event.status}${event.status === 'error' ? ` ${JSON.stringify(event.result)}` : ''}`);
        }
        if (response.pendingConfirmation) {
          pendingId = response.pendingConfirmation.pendingId;
          t.pendingSeen = true;
          t.facts.push(response.pendingConfirmation.summary);
          t.lines.push(`  [card] confirmation shown: eligible loan ${response.pendingConfirmation.summary.eligibleLoan}`);
        }
        reply = response.messages.map((m) => m.content).join('\n');
      } else {
        if (!sessionId || !pendingId) {
          failures.push(`step ${index + 1}: nothing to ${step.action} (no confirmation card was shown)`);
          break;
        }
        t.lines.push(`user presses ${step.action === 'confirm' ? 'Confirm' : 'Cancel'}`);
        const response =
          step.action === 'confirm' ? (await agent.confirm(sessionId, pendingId)).body : await agent.cancel(sessionId, pendingId);
        pendingId = undefined;
        t.facts.push(response.outcome);
        t.lines.push(`  [outcome] ${JSON.stringify(response.outcome).slice(0, 200)}`);
        reply = response.messages.map((m) => m.content).join('\n');
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      failures.push(`step ${index + 1} threw ${e.code ?? ''} ${e.message ?? String(err)}`.trim());
      break;
    }
    t.replies.push(reply);
    t.lines.push(`assistant: ${reply.replace(/\n+/g, ' / ')}`);
    if (step.expect) failures.push(...checkStep(step.expect, reply, stepTools).map((f) => `step ${index + 1}: ${f}`));
  }

  failures.push(...(await checkConversation(conversation.expect, t, seededCount)));
  if (failures.length > 0) printTranscript(conversation, t);
  return failures;
}

function checkStep(expect: StepExpect, reply: string, tools: Set<string>): string[] {
  const failures: string[] = [];
  for (const tool of expect.toolsCalled ?? []) if (!tools.has(tool)) failures.push(`expected ${tool} to be called`);
  for (const tool of expect.toolsNotCalled ?? []) if (tools.has(tool)) failures.push(`${tool} should not be called`);
  for (const pattern of expect.replyMatches ?? []) if (!new RegExp(pattern, 'i').test(reply)) failures.push(`reply does not match /${pattern}/`);
  for (const pattern of expect.replyNotMatches ?? []) if (new RegExp(pattern, 'i').test(reply)) failures.push(`reply matches forbidden /${pattern}/`);
  return failures;
}

async function checkConversation(expect: Conversation['expect'], t: Transcript, seededCount: number): Promise<string[]> {
  const failures = checkStep(expect, t.replies.at(-1) ?? '', t.toolsCalled);

  for (const { tool, field } of expect.toolErrors ?? []) {
    if (!t.toolErrors.some((e) => e.tool === tool && e.fields.includes(field))) failures.push(`expected ${tool} to return an error on ${field}`);
  }
  if (expect.pendingConfirmation !== undefined && expect.pendingConfirmation !== t.pendingSeen) {
    failures.push(expect.pendingConfirmation ? 'expected a confirmation card' : 'a confirmation card was shown but should not be');
  }

  const created = await prisma.lead.findMany({ orderBy: { id: 'asc' }, skip: seededCount });
  if (expect.leadCreated !== undefined && expect.leadCreated !== created.length > 0) {
    failures.push(expect.leadCreated ? 'expected a lead to be created' : `${created.length} lead(s) were created but none should be`);
  }
  if (expect.leadMatches) {
    const lead = created[0] as Record<string, unknown> | undefined;
    if (!lead) failures.push('no lead to compare with leadMatches');
    else {
      for (const [key, value] of Object.entries(expect.leadMatches)) {
        if (String(lead[key]) !== String(value)) failures.push(`lead.${key} is ${String(lead[key])}, expected ${value}`);
      }
    }
  }

  if (expect.numbersGrounded) {
    const known = groundTruth(t.facts);
    const ungrounded = t.replies.flatMap(figuresIn).filter((figure) => !known.has(figure.value));
    if (ungrounded.length > 0) failures.push(`ungrounded numbers: ${[...new Set(ungrounded.map((f) => f.text))].join(', ')}`);
  }
  return failures;
}

// ---- numbersGrounded ----
const toNumber = (text: string) => Number(text.replace(/,/g, ''));

/** ₹ / Rs / INR amounts and gram weights mentioned in a reply. */
function figuresIn(reply: string): Array<{ text: string; value: number }> {
  const figures: Array<{ text: string; value: number }> = [];
  for (const m of reply.matchAll(/(?:₹|\bRs\.?|\bINR)\s?(\d[\d,]*(?:\.\d+)?)/gi)) figures.push({ text: m[0], value: toNumber(m[1]!) });
  for (const m of reply.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(?:g|gm|gms|grams?)\b/gi)) figures.push({ text: m[0], value: toNumber(m[1]!) });
  return figures;
}

/** Every number inside the session's tool results and server outcomes, including those in display strings. */
function groundTruth(facts: unknown[]): Set<number> {
  const numbers = new Set<number>();
  const walk = (value: unknown): void => {
    if (typeof value === 'number') numbers.add(value);
    else if (typeof value === 'string') for (const m of value.matchAll(/\d[\d,]*(?:\.\d+)?/g)) numbers.add(toNumber(m[0]));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  facts.forEach(walk);
  return numbers;
}

function printTranscript(conversation: Conversation, t: Transcript) {
  console.log(`\n   ── transcript: ${conversation.id} ──`);
  for (const line of t.lines) console.log(`   ${maskMobilesInText(line).slice(0, 400)}`);
}

function fail(message: string): never {
  console.error(`[eval] ${message}`);
  process.exit(1);
}

// ---- 5. Main ----
const filter = process.argv[2];
const dir = fileURLToPath(new URL('./conversations/', import.meta.url));
const conversations = readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => Conversation.parse(JSON.parse(readFileSync(dir + file, 'utf8'))))
  .filter((c) => !filter || c.id.includes(filter));
const delayMs = Number(process.env.EVAL_DELAY_MS ?? 4000);

console.log(`Loan Assist evals: ${conversations.length} conversations, models ${config.llm.models.join(' > ')}, test DB\n`);
const results: Array<{ id: string; title: string; pass: boolean; reason: string; seconds: string }> = [];
for (const [index, conversation] of conversations.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  console.log(`▶ ${conversation.id}: ${conversation.title}`);
  const started = Date.now();
  const failures = await runConversation(conversation);
  results.push({
    id: conversation.id,
    title: conversation.title,
    pass: failures.length === 0,
    reason: failures.join('; ') || 'all expectations met',
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  });
}

const width = { id: Math.max(2, ...results.map((r) => r.id.length)), title: Math.max(5, ...results.map((r) => r.title.length)) };
console.log(`\n${'id'.padEnd(width.id)}  ${'title'.padEnd(width.title)}  result  time    reason`);
console.log(`${'-'.repeat(width.id)}  ${'-'.repeat(width.title)}  ------  ------  ------`);
for (const r of results) {
  console.log(`${r.id.padEnd(width.id)}  ${r.title.padEnd(width.title)}  ${r.pass ? 'PASS  ' : 'FAIL  '}  ${(r.seconds + 's').padStart(6)}  ${r.reason}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await prisma.$disconnect();
process.exit(failed > 0 ? 1 : 0);
