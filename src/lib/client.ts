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
  if (res.status === 401 && init?.retry !== false && (!path.includes("/api/auth/") || path === "/api/auth/me")) {
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
const inFlight = new Map<string, Promise<unknown>>();
function canonicalRequest(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRequest).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalRequest(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
const mutate = async <T = unknown>(path: string, body?: unknown, method = "POST"): Promise<T> => {
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const send = (clientMutationId: string) => api<T>(path, { method, body: JSON.stringify({ ...payload, clientMutationId }) });
  // POS/purchases already persist their own outbox ID before calling transport.
  if (typeof payload.clientMutationId === "string") return send(payload.clientMutationId);
  const financial = path.startsWith("/api/admin/") || /^\/api\/(payments|expenses|inventory)$/.test(path) || /^\/api\/(sales|purchases)\/[^/]+\/return$/.test(path);
  if (!financial || typeof window === "undefined") return send(newMutationId());
  const { user } = await apiGet<{user:{id:string;tenantId:string}}>("/api/auth/me");
  if (!crypto.subtle) throw new ClientError("يلزم اتصال آمن لحفظ العملية", 400);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest({path,payload,method})));
  const fingerprint = [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const key = `meqwat_pending_v1:${user.tenantId}:${user.id}:${fingerprint}`;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  let id: string;
  try {
    id = localStorage.getItem(key) || newMutationId();
    localStorage.setItem(key,id);
  } catch { throw new ClientError("تعذر حفظ معرّف العملية — لم يتم إرسالها",400); }
  const task = (async () => {
    try {
      const result = await send(id);
      localStorage.removeItem(key);
      return result;
    } catch (error) {
      // Uncertain transport/5xx: retain the key across manual retry and reload.
      if (error instanceof ClientError && error.status >= 400 && error.status < 500 && error.status !== 409) localStorage.removeItem(key);
      throw error;
    } finally { inFlight.delete(key); }
  })();
  inFlight.set(key, task);
  return task;
};
export const apiPost = <T = unknown>(path: string, body?: unknown) => mutate<T>(path,body);
export const apiPatch = <T = unknown>(path: string, body?: unknown) => mutate<T>(path,body,"PATCH");
export const apiDelete = <T = unknown>(path: string) => api<T>(path, { method: "DELETE" });

export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Exhaust paginated selectors instead of silently truncating at the API cap. */
export async function apiCollection<T>(path: string): Promise<{items:T[];total:number}> {
  const url=new URL(path,"https://local.invalid");url.searchParams.set("limit","200");
  const items:T[]=[];
  for(let offset=0;;){
    url.searchParams.set("offset",String(offset));
    const page=await apiGet<{items:T[];total?:number}>(`${url.pathname}${url.search}`);
    items.push(...page.items);offset+=page.items.length;
    if(!page.items.length||(page.total!==undefined?offset>=page.total:page.items.length<200))return {items,total:page.total??items.length};
    if(offset>100000)throw new ClientError("استخدم البحث لتقليل حجم النتائج",400);
  }
}
