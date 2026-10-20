import type { AppState } from './types';

interface StateSource {
  getState(): Promise<AppState>;
  onState(handler: (state: AppState) => void): () => void;
}

// Subscribe before requesting the initial state. A late IPC reply or failure
// must not replace a newer pushed account roster, including after tray reopen.
export function connectState(source: StateSource, receive: (state: AppState) => void, failed: () => void) {
  let disposed = false, delivered = false, lastRevision = -1, request = 0;
  const accept = (state: AppState) => {
    if (disposed) return;
    const revision = state.revision ?? 0;
    if (revision < lastRevision) return;
    lastRevision = revision; delivered = true; receive(state);
  };
  const unsubscribe = source.onState(accept);
  const sync = async () => {
    const ticket = ++request;
    try {
      const state = await source.getState();
      if (ticket === request) accept(state);
    } catch { if (!disposed && !delivered && ticket === request) failed(); }
  };
  void sync();
  return { sync, dispose: () => { disposed = true; unsubscribe(); } };
}
