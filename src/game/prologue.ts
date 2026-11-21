/** Пролог после ника: один раз автоматически, пересмотр по желанию. */

function prologueKey(login: string): string {
  return `orakul-prologue-seen:${login.trim().toLowerCase()}`;
}

export function hasSeenPrologue(login: string): boolean {
  if (!login.trim()) return false;
  try {
    return localStorage.getItem(prologueKey(login)) === "1";
  } catch {
    return true;
  }
}

export function markPrologueSeen(login: string): void {
  if (!login.trim()) return;
  try {
    localStorage.setItem(prologueKey(login), "1");
  } catch {
    /* private mode */
  }
}

export function clearPrologueSeen(login: string): void {
  if (!login.trim()) return;
  try {
    localStorage.removeItem(prologueKey(login));
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
