import { CHAT_MESSAGE_MAX_LENGTH } from '@goldloan/shared';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLoanAssist, type ChatItem } from '../../hooks/useLoanAssist';
import { Button } from '../Button';
import { ConfirmationCard } from './ConfirmationCard';
import { QuoteCard } from './QuoteCard';

const STARTERS = ['I have 45 g of 22K gold, how much can I get?', 'What plans do you have?'];

/** "Chat with Loan Assist" button plus the panel: full-screen sheet on mobile, side panel from 768 px. */
export function LoanAssist() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const chat = useLoanAssist();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Focus the input on open; give focus back to the button on close. Lock page scroll while open.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (wasOpen.current) triggerRef.current?.focus();
    }
    wasOpen.current = open;
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.items.length, chat.waiting]);

  // Put focus back in the input once a reply arrives (it was disabled while waiting).
  useEffect(() => {
    if (open && !chat.waiting) inputRef.current?.focus();
  }, [chat.waiting, open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (chat.waiting || !draft.trim()) return;
    void chat.send(draft);
    setDraft('');
  }

  // Esc closes; Tab stays inside the panel while it is open (it is modal).
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <Button ref={triggerRef} variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" className="sm:self-start">
        Chat with Loan Assist
      </Button>

      {/* Kept mounted while closed so the conversation survives closing the panel. */}
      <div hidden={!open}>
        <div className="fixed inset-0 z-40 hidden bg-slate-900/30 md:block" onClick={() => setOpen(false)} aria-hidden="true" />
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="loan-assist-title"
          onKeyDown={handleKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-white md:left-auto md:w-[420px] md:border-l md:border-slate-200 md:shadow-xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 id="loan-assist-title" className="font-semibold text-slate-900">
                Loan Assist
              </h2>
              <p className="text-sm text-slate-600">Quotes come from our calculator. Preliminary offers only.</p>
            </div>
            <Button variant="secondary" onClick={() => setOpen(false)} className="h-11 shrink-0 px-3 text-sm">
              Close
            </Button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {chat.items.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-600">
                  Ask about your gold and I will get a quote, or help you apply. Try one of these:
                </p>
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void chat.send(starter)}
                    disabled={chat.waiting}
                    className="min-h-11 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-left text-sm text-brand-800 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}

            {chat.items.map((item) => (
              <ChatEntry key={item.id} item={item} chat={chat} />
            ))}

            {chat.waiting && (
              <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 text-sm text-slate-600">
                <span>Loan Assist is typing</span>
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-500 motion-safe:animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* New assistant messages are read out here (the list itself is not live, to avoid re-reading cards). */}
          <p role="status" className="sr-only">
            {chat.announcement}
          </p>

          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 px-4 py-3">
            <label htmlFor="loan-assist-input" className="sr-only">
              Message Loan Assist
            </label>
            <input
              ref={inputRef}
              id="loan-assist-input"
              type="text"
              autoComplete="off"
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              placeholder="Type your message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={chat.waiting}
              className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-slate-50"
            />
            <Button type="submit" disabled={chat.waiting || !draft.trim()}>
              Send
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}

function ChatEntry({ item, chat }: { item: ChatItem; chat: ReturnType<typeof useLoanAssist> }) {
  switch (item.kind) {
    case 'user':
      return (
        <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-700 px-4 py-2.5 text-white">
          <span className="sr-only">You: </span>
          {item.text}
        </p>
      );
    case 'assistant':
      return (
        <p className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-slate-900">
          <span className="sr-only">Loan Assist: </span>
          {item.text}
        </p>
      );
    case 'quote':
      return <QuoteCard quote={item.quote} />;
    case 'confirmation':
      return <ConfirmationCard item={item} onConfirm={(id) => void chat.confirm(id)} onCancel={(id) => void chat.cancel(id)} />;
    case 'error':
      return (
        <div role="alert" className="flex flex-col gap-2 self-start rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{item.message}</p>
          <Button variant="secondary" onClick={() => void chat.retry(item)} disabled={chat.waiting} className="self-start">
            Retry
          </Button>
        </div>
      );
  }
}
