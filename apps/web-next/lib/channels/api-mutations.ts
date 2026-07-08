// Shared mutation helpers for IA v6 Channels module.
// Wraps fetch with credentials, JSON body, error normalization.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

function fullPath(p: string): string {
  if (!API_BASE) return p;
  if (p.startsWith("http")) return p;
  return API_BASE + p;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("panmira.token");
}

export interface MutationResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function doFetch<T = any>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: any,
  signal?: AbortSignal,
): Promise<MutationResult<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["authorization"] = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const resp = await fetch(fullPath(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      credentials: "include",
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!resp.ok) {
      const errMsg = parsed?.error || parsed?.message || `HTTP ${resp.status}`;
      return { ok: false, status: resp.status, data: parsed, error: String(errMsg) };
    }
    return { ok: true, status: resp.status, data: parsed as T, error: null };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err?.name === "AbortError" ? "请求超时 (10s)" : String(err?.message || err),
    };
  }
}

export const apiPost = <T = any>(path: string, body?: any, signal?: AbortSignal) =>
  doFetch<T>("POST", path, body, signal);
export const apiPatch = <T = any>(path: string, body?: any, signal?: AbortSignal) =>
  doFetch<T>("PATCH", path, body, signal);
export const apiPut = <T = any>(path: string, body?: any, signal?: AbortSignal) =>
  doFetch<T>("PUT", path, body, signal);
export const apiDelete = <T = any>(path: string, body?: any, signal?: AbortSignal) =>
  doFetch<T>("DELETE", path, body, signal);

/** Convenience: run mutation then refresh hook, return ok flag. */
export async function mutate<T = any>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  opts: { body?: any; refresh?: () => void; signal?: AbortSignal } = {},
): Promise<MutationResult<T>> {
  let result: MutationResult<T>;
  if (method === "POST") result = await apiPost<T>(path, opts.body, opts.signal);
  else if (method === "PATCH") result = await apiPatch<T>(path, opts.body, opts.signal);
  else if (method === "PUT") result = await apiPut<T>(path, opts.body, opts.signal);
  else result = await apiDelete<T>(path, opts.body, opts.signal);
  if (result.ok && opts.refresh) {
    // Defer refresh to next tick so backend writes commit
    setTimeout(() => opts.refresh!(), 50);
  }
  return result;
}
