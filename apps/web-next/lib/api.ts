import { getToken, clearSession } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** 跳过自动 401 跳转(用于 login 等) */
  skipAuthRedirect?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, skipAuthRedirect, headers, ...rest } = opts;

  const token = getToken();
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(path, init);

  if (res.status === 401 && !skipAuthRedirect) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errBody.error ?? `HTTP ${res.status}`, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
