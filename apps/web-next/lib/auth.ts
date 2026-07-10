// JWT 持久化 + 登录状态。SSR-safe:window 访问都做 typeof 检查。
const TOKEN_KEY = "panmira.token";
const REFRESH_KEY = "panmira.refresh";
const USER_KEY = "panmira.user";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  // R43: 系统内置账号标识(后端 users.is_system)
  // true = 当前用户是系统管理员,前端用此挂星标 / 禁自操作
  isSystem?: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function setSession(res: LoginResponse): void {
  window.localStorage.setItem(TOKEN_KEY, res.accessToken);
  window.localStorage.setItem(REFRESH_KEY, res.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Login failed (${r.status})`);
  }
  const data = (await r.json()) as LoginResponse;
  setSession(data);
  return data;
}

export function logout(): void {
  clearSession();
  window.location.href = "/login";
}
