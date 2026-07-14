/**
 * wm-core (auth, conf/ec caching, lang, geolocation) reads/writes
 * `localStorage` directly in several places, assuming it's always available —
 * true for the webapp, not for a widget embedded on an arbitrary third-party
 * page. If that page frames us in a sandboxed iframe without
 * `allow-same-origin`, merely accessing `window.localStorage` throws a
 * `SecurityError` synchronously, breaking every wm-core code path that touches
 * it. Since we can't modify wm-core, shadow `window.localStorage` with an
 * in-memory fallback (call before any wm-core code runs) — same technique for
 * `sessionStorage`, which the spec restricts identically.
 */
function shimStorageIfBlocked(prop: 'localStorage' | 'sessionStorage'): void {
  try {
    window[prop];
    return;
  } catch {
    // access itself threw — fall through to the in-memory shim below
  }
  const memory = new Map<string, string>();
  const fallback: Storage = {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(window, prop, {value: fallback, configurable: true});
}

export function ensureSafeStorage(): void {
  shimStorageIfBlocked('localStorage');
  shimStorageIfBlocked('sessionStorage');
}
