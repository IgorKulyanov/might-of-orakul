import type { ApiUser } from "./api";

const TOKEN_KEY = "orakul-session-token";
const USER_KEY = "orakul-session-user";
const LAST_LOGIN_KEY = "orakul-last-login";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getLastLogin(): string {
  try {
    return localStorage.getItem(LAST_LOGIN_KEY) || "";
  } catch {
    return "";
  }
}

export function setLastLogin(login: string): void {
  try {
    localStorage.setItem(LAST_LOGIN_KEY, login);
  } catch {
    /* ignore */
  }
}

export function getCachedUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: ApiUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (user?.login) setLastLogin(user.login);
}

export function updateCachedUser(user: ApiUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
