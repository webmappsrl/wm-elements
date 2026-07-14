/**
 * wm-core (auth, conf/ec caching, lang, geolocation) reads/writes
 * `localStorage`/`sessionStorage` directly in several places, assuming
 * they're always available — true for the webapp, not for a widget embedded
 * on an arbitrary third-party page. If that page frames us in a sandboxed
 * iframe without `allow-same-origin`, real browser storage is blocked; merely
 * accessing `window.localStorage` throws a `SecurityError`.
 *
 * Detecting this first (try accessing, patch only if it throws) turned out
 * unreliable: in Chromium, the very first access after navigation can
 * succeed while a later one in the same sandboxed document throws — the
 * exact browser-internal timing isn't something to depend on.
 *
 * None of wm-core's storage usage needs cross-reload persistence for this
 * read-only, no-auth, no-UGC widget (API response caching, an unused
 * access_token, an unused privacy_agree flag, a lang preference, a
 * geolocation distance filter we never use). So instead of detecting
 * anything, always replace both with an in-memory implementation scoped to
 * this page load — a cache miss on next reload costs one extra network
 * request, nothing else, on every page (sandboxed or not), for the same
 * behavior everywhere rather than something that only sometimes doesn't
 * throw depending on browser state.
 */
function createMemoryStorage(): Storage {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() {
      return memory.size;
    },
  };
}

export function ensureSafeStorage(): void {
  for (const prop of ['localStorage', 'sessionStorage'] as const) {
    try {
      Object.defineProperty(window, prop, {value: createMemoryStorage(), configurable: true});
    } catch {
      // Extremely unlikely (defineProperty on `window` itself blocked) — if
      // it happens, wm-core's own unguarded calls will throw as before,
      // no worse than not attempting this at all.
    }
  }
}
