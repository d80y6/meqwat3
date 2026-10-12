"use client";

/** Typed fetch wrapper: unwraps {ok,data} envelopes and auto-refreshes the
 *  access token once on 401 before retrying the original request. */
export class ClientError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

export async function api<T = unknown>(path: string, init?: RequestInit & { retry?: boolean }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401 && init?.retry !== false && !path.includes("/api/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return api<T>(path, { ...init, retry: false });
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ClientError("انتهت الجلسة", 401, "UNAUTHENTICATED");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new ClientError(json?.error ?? "حدث خطأ في الاتصال بالخادم", res.status, json?.code);
  }
  return json.data as T;
}

export const apiGet = <T = unknown>(path: string) => api<T>(path);
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
export const apiDelete = <T = unknown>(path: string) => api<T>(path, { method: "DELETE" });

export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
