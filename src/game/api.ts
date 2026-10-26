import type { OwnedState } from "./types";

/**
 * Локально в браузере — пусто: Vite проксирует /api → :8787.
 * На хостинге задай VITE_API_URL (Render) — иначе /api на Pages не существует.
 * В скриптах без окна — VITE_API_URL или localhost.
 */
function resolveApiUrl(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/$/,
    "",
  );
  if (env) return env;
  if (typeof window !== "undefined") return "";
  return "http://127.0.0.1:8787";
}

const API_URL = resolveApiUrl();

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
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = opts;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        // localtunnel interstitial; harmless elsewhere
        "Bypass-Tunnel-Reminder": "true",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new Error(
      "Нет связи с API. Проверь: окна СЕРВЕР-ДОМА и TUNNEL открыты, а VITE_API_URL = текущий URL туннеля (после смены URL нужен Redeploy).",
    );
  }
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    const err = new Error(data.error || `Ошибка ${res.status}`) as Error & {
      code?: string;
    };
    if (data.code) err.code = data.code;
    throw err;
  }
  return data;
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

export { API_URL };
