/** Пролог после ника: один раз автоматически, пересмотр по желанию. */

/** Fallback, если localStorage недоступен / setItem упал. */
const seenMemory = new Set<string>();

function prologueKey(login: string): string {
  return `orakul-prologue-seen:${login.trim().toLowerCase()}`;
}

export function hasSeenPrologue(login: string): boolean {
  if (!login.trim()) return false;
  const key = prologueKey(login);
  if (seenMemory.has(key)) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return seenMemory.has(key);
  }
}

export function markPrologueSeen(login: string): void {
  if (!login.trim()) return;
  const key = prologueKey(login);
  seenMemory.add(key);
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode — память сессии уже отмечена */
  }
}

export function clearPrologueSeen(login: string): void {
  if (!login.trim()) return;
  const key = prologueKey(login);
  seenMemory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Кадры-заглушки: картинки подставишь позже. */
export type PrologueSlide = {
  title: string;
  body: string;
  /** Путь в /public, опционально. */
  art?: string;
};

export const PROLOGUE_SLIDES: PrologueSlide[] = [
  {
    title: "Врата оракула",
    body: "Мир держится на пяти школах. Ты ещё искатель — без знамени и без дома.",
  },
  {
    title: "Путь впереди",
    body: "Короткое обучение покажет вкус каждой силы. Потом выберешь школу — и откроется весь мир.",
  },
];
