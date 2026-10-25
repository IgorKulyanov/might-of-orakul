/** Node polyfill for game modules that touch localStorage. */
const store = new Map<string, string>();

const localStoragePolyfill = {
  getItem(key: string): string | null {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string): void {
    store.set(String(key), String(value));
  },
  removeItem(key: string): void {
    store.delete(String(key));
  },
  clear(): void {
    store.clear();
  },
  key(index: number): string | null {
    return [...store.keys()][index] ?? null;
  },
  get length() {
    return store.size;
  },
};

const g = globalThis as typeof globalThis & {
  localStorage?: typeof localStoragePolyfill;
  window?: { localStorage: typeof localStoragePolyfill };
};

if (!g.localStorage) {
  g.localStorage = localStoragePolyfill;
}
if (!g.window) {
  g.window = { localStorage: localStoragePolyfill };
}

export function resetLocalStorage(): void {
  store.clear();
}
