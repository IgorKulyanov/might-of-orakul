/**
 * Фраза в чате только ОТКРЫВАЕТ меню компенсации (не выдаёт валюту).
 * Выдача — только API с кодом, который владелец вводит руками.
 * Секрет на сервере: ORACUL_OWNER_CODE (в бандл клиента не кладём).
 */
const OPEN_PHRASE = "оракул792640";

export function isOwnerBoostCode(text: string): boolean {
  return (
    text.trim().toLowerCase().replace(/\s+/g, "") ===
    OPEN_PHRASE.toLowerCase().replace(/\s+/g, "")
  );
}

const CODE_SESSION_KEY = "orakul-owner-boost-code";

export function loadOwnerBoostCode(): string {
  try {
    return sessionStorage.getItem(CODE_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function saveOwnerBoostCode(code: string): void {
  try {
    const c = code.trim();
    if (c) sessionStorage.setItem(CODE_SESSION_KEY, c);
    else sessionStorage.removeItem(CODE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
