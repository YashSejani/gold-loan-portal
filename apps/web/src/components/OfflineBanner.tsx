import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineBanner() {
  const online = useOnlineStatus();
  return (
    <div role="status" className={online ? 'sr-only' : 'border-b border-amber-300 bg-amber-50'}>
      {!online && (
        <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm text-amber-900">
          You are offline. What you have entered is kept; quotes and submissions will work again once you are back
          online.
        </p>
      )}
    </div>
  );
}
