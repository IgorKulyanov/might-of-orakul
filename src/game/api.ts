import type { OwnedState } from "./types";

/**
 * На pages.dev — тот же origin (Cloudflare Functions → VPS).
 * Иначе VITE_API_URL / localhost. Игрокам sslip не нужен.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith("pages.dev") || host.endsWith("orakul.pages.dev")) {
      return "";
    }
  }
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/$/,
    "",
  );
  if (env) return env;
  if (typeof window !== "undefined") return "";
  return "http://127.0.0.1:8787";
}

/** @deprecated use getApiBase() — оставлено для старых импортов */
const API_URL = typeof window === "undefined" ? getApiBase() : "";

export type ApiUser = {
  id: string;
  login: string;
  displayName: string | null;
  heroId: string | null;
  telegramId: string | null;
  owned: OwnedState | null;
  needsOnboarding: boolean;
  lastLoginAt?: string | null;
  dormant?: boolean;
  pendingResetCampaign?: boolean;
  pendingClearPvpBan?: boolean;
  pvpFlee?: {
    day: string;
    fleeCount: number;
    bannedUntil: number;
  } | null;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "Bypass-Tunnel-Reminder": "true",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };

  const base = getApiBase();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base}${path}`, init);
      const data = (await res.json().catch(() => ({}))) as T & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        const err = new Error(data.error || `Ошибка ${res.status}`) as Error & {
          code?: string;
        };
        if (data.code) err.code = data.code;
        // 502 от прокси — ещё раз
        if (res.status >= 502 && attempt < 2) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw err;
      }
      return data;
    } catch (e) {
      lastErr = e;
      if (
        e instanceof Error &&
        !(e instanceof TypeError) &&
        !/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(
          e.message,
        )
      ) {
        throw e;
      }
      if (attempt < 2) {
        await sleep(400 * (attempt + 1));
        continue;
      }
    }
  }
  throw new Error(
    lastErr instanceof Error && lastErr.message.startsWith("Ошибка")
      ? lastErr.message
      : "Нет связи с сервером. Подожди пару секунд и нажми ещё раз.",
  );
}

export function apiRegister(login: string, password: string) {
  return request<AuthResponse>("/api/register", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
}

export function apiLogin(login: string, password: string) {
  return request<AuthResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
}

export function apiTelegramAuth(payload: {
  telegramId: string;
  firstName?: string;
  initData?: string;
}) {
  return request<AuthResponse>("/api/telegram-auth", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function apiMe(token: string) {
  return request<{ user: ApiUser }>("/api/me", { token });
}

export function apiUpdateMe(
  token: string,
  body: {
    displayName?: string;
    heroId?: string;
    owned?: OwnedState;
    clearPendingResetCampaign?: boolean;
    clearPendingClearPvpBan?: boolean;
    pvpFlee?: {
      day: string;
      fleeCount: number;
      bannedUntil: number;
    };
  },
) {
  return request<{ user: ApiUser }>("/api/me", {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
}

export function apiCreateRoom(token: string, code?: string) {
  return request<{ roomId: string; status: string; message: string }>(
    "/api/rooms",
    {
      method: "POST",
      token,
      body: JSON.stringify({ code }),
    },
  );
}

export function apiFeedback(
  token: string,
  body: { text: string; screen?: string },
) {
  return request<{ ok: boolean; message: string }>("/api/feedback", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

const ADMIN_KEY_FLAG = "orakul_admin_key";

export function getAdminKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY_FLAG);
  } catch {
    return null;
  }
}

export function setAdminKey(key: string | null) {
  try {
    if (key) sessionStorage.setItem(ADMIN_KEY_FLAG, key);
    else sessionStorage.removeItem(ADMIN_KEY_FLAG);
  } catch {
    /* ignore */
  }
}

async function adminRequest<T>(
  path: string,
  opts: RequestInit & { adminKey: string } = { adminKey: "" },
): Promise<T> {
  const { adminKey, headers, ...rest } = opts;
  return request<T>(path, {
    ...rest,
    headers: {
      "X-Admin-Key": adminKey,
      ...headers,
    },
  });
}

export function apiAdminPing(adminKey: string) {
  return adminRequest<{ ok: boolean; message: string; users: number }>(
    "/api/admin/ping",
    { method: "POST", adminKey, body: "{}" },
  );
}

export function apiAdminInbox(adminKey: string) {
  return adminRequest<{
    feedback: unknown[];
    reports: unknown[];
    mutes: Array<{
      userId: string;
      login: string;
      until: number;
      reason: string;
    }>;
  }>("/api/admin/inbox", { adminKey });
}

export function apiAdminUsers(adminKey: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return adminRequest<{
    users: Array<{
      id: string;
      login: string;
      displayName: string | null;
      lastLoginAt: string | null;
      dormant: boolean;
      gold: number;
      diamonds: number;
      level: number;
      chatMutedUntil: number | null;
      pvpBanned?: boolean;
      pvpBannedUntil?: number | null;
      pendingResetCampaign?: boolean;
    }>;
  }>(`/api/admin/users${qs}`, { adminKey });
}

export function apiAdminMute(
  adminKey: string,
  body: { login: string; minutes: number; reason?: string },
) {
  return adminRequest<{ ok: boolean; message: string }>("/api/admin/mute", {
    method: "POST",
    adminKey,
    body: JSON.stringify(body),
  });
}

export function apiAdminUnmute(adminKey: string, login: string) {
  return adminRequest<{ ok: boolean; message: string }>("/api/admin/unmute", {
    method: "POST",
    adminKey,
    body: JSON.stringify({ login }),
  });
}

export function apiAdminGrant(
  adminKey: string,
  body: { login: string; gold?: number; diamonds?: number; note?: string },
) {
  return adminRequest<{ ok: boolean; message: string }>("/api/admin/grant", {
    method: "POST",
    adminKey,
    body: JSON.stringify(body),
  });
}

export function apiOwnerBoost(body: {
  code: string;
  login: string;
  gold?: number;
  diamonds?: number;
  cardId?: string;
  note?: string;
}) {
  return request<{ ok: boolean; message: string }>("/api/owner/boost", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function apiPresence(token: string, screen: string) {
  return request<{ ok: boolean; screen: string }>("/api/presence", {
    method: "POST",
    token,
    body: JSON.stringify({ screen }),
  });
}

export function apiCreatePayment(
  token: string,
  packId: string,
  contact?: { email?: string; phone?: string },
) {
  return request<{
    ok: boolean;
    orderId: string;
    paymentId: string;
    confirmationUrl: string;
    amountRub: number;
    diamonds: number;
  }>("/api/payments/create", {
    method: "POST",
    token,
    body: JSON.stringify({
      packId,
      email: contact?.email,
      phone: contact?.phone,
    }),
  });
}

export function apiPaymentOrder(token: string, orderId: string) {
  return request<{
    ok: boolean;
    order: {
      orderId: string;
      packId: string;
      diamonds: number;
      amountRub: number;
      status: string;
      paidAt: string | null;
      createdAt: string;
    } | null;
  }>(`/api/payments/order/${encodeURIComponent(orderId)}`, { token });
}

export function apiPaymentPacks() {
  return request<{
    ok: boolean;
    configured: boolean;
    packs: Array<{
      id: string;
      title: string;
      diamonds: number;
      amountRub: number;
      priceLabel: string;
    }>;
  }>("/api/payments/packs");
}

export function apiAdminStats(adminKey: string) {
  return adminRequest<{
    ok: boolean;
    registered: number;
    registeredToday: number;
    dormant: number;
    onlineNow: number;
    onlineWho: Array<{
      login: string;
      name: string;
      screen: string;
    }>;
    screens: {
      menu: number;
      battle: number;
      battlePvp: number;
      cabinet: number;
      multi: number;
      other: number;
    };
    active15m: number;
    active1h: number;
    active24h: number;
    chatOnline: number;
    pvpRooms: number;
    pvpPlayers: number;
    pvpInBattle: number;
    pvpInLobby: number;
    bannedPvp: number;
    pendingCampaignResets: number;
    uptimeSec: number;
  }>("/api/admin/stats", { adminKey });
}

export function apiAdminClearPvpBan(adminKey: string, login: string) {
  return adminRequest<{ ok: boolean; message: string }>(
    "/api/admin/clear-pvp-ban",
    {
      method: "POST",
      adminKey,
      body: JSON.stringify({ login }),
    },
  );
}

export function apiAdminResetCampaign(adminKey: string, login: string) {
  return adminRequest<{ ok: boolean; message: string }>(
    "/api/admin/reset-campaign",
    {
      method: "POST",
      adminKey,
      body: JSON.stringify({ login }),
    },
  );
}

export { API_URL };
