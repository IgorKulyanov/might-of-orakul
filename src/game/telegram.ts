/** Минимальные типы Telegram WebApp без полной зависимости от SDK. */
type TgUser = {
  id: number;
  first_name?: string;
  username?: string;
};

type TgWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: TgUser };
  ready?: () => void;
  expand?: () => void;
  colorScheme?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getTelegramWebApp(): TgWebApp | null {
  try {
    return window.Telegram?.WebApp ?? null;
  } catch {
    return null;
  }
}

export function detectTelegramUser(): {
  telegramId: string;
  firstName: string;
  initData: string;
} | null {
  const wa = getTelegramWebApp();
  if (!wa) return null;
  const user = wa.initDataUnsafe?.user;
  if (!user?.id) return null;
  try {
    wa.ready?.();
    wa.expand?.();
  } catch {
    /* ignore */
  }
  return {
    telegramId: String(user.id),
    firstName: user.first_name || user.username || "Игрок",
    initData: wa.initData || "",
  };
}
