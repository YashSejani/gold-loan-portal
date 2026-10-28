import { randomUUID } from 'node:crypto';
import type { LeadRequest, PendingSummaryDto } from '@goldloan/shared';
import type { ChatMessage } from './llmClient';

export const SESSION_TTL_MS = 30 * 60 * 1000;
export const PENDING_TTL_MS = 10 * 60 * 1000;

/** A prepared application waiting for the user's Confirm click. Lives only on the server. */
export interface PendingSubmission {
  pendingId: string;
  payload: LeadRequest;
  /** The exact numbers the user is shown; confirm compares a fresh quote against these. */
  quoted: { ratePaisePerGram: bigint; appliedLtvBps: number; eligibleLoanRupees: number };
  summary: PendingSummaryDto;
  expiresAt: number;
  /** Set while a confirm is in flight, so a double click cannot create two leads. */
  locked: boolean;
}

export interface Session {
  id: string;
  messages: ChatMessage[];
  pending: PendingSubmission | null;
  lastActive: number;
}

export interface SessionStore {
  /** The live session, or null if unknown or idle for more than 30 minutes. */
  get(sessionId: string): Session | null;
  create(): Session;
  touch(session: Session): void;
}

/** In-memory sessions (CLAUDE.md §9.2): fine for one API process; history never leaves the server. */
export function createSessionStore({ now = Date.now, ttlMs = SESSION_TTL_MS } = {}): SessionStore {
  const sessions = new Map<string, Session>();
  const isExpired = (session: Session) => now() - session.lastActive > ttlMs;

  const sweep = setInterval(() => {
    for (const [id, session] of sessions) if (isExpired(session)) sessions.delete(id);
  }, 5 * 60 * 1000);
  sweep.unref();

  return {
    get(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return null;
      if (isExpired(session)) {
        sessions.delete(sessionId);
        return null;
      }
      return session;
    },
    create() {
      const session: Session = { id: randomUUID(), messages: [], pending: null, lastActive: now() };
      sessions.set(session.id, session);
      return session;
    },
    touch(session) {
      session.lastActive = now();
    },
  };
}
