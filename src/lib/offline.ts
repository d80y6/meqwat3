"use client";

import { apiGet, apiPost, newMutationId } from "./client";

/**
 * Offline-first operation queue (localStorage-persisted).
 * Every queued op carries a stable clientMutationId so server retries are
 * idempotent: re-sending an already-applied op returns "duplicate" and never
 * double-charges stock, cash, or debt.
 */
export interface QueuedOp {
  clientMutationId: string;
  type: "sale" | "purchase" | "payment";
  payload: Record<string, unknown>;
  label: string;
  createdAt: string;
  status: "pending" | "conflict" | "error";
  error?: string;
  attempts: number;
}

// Legacy v1 is deliberately quarantined: its owner cannot be established.
let owner: { tenantId: string; userId: string } | null = null;
export function setQueueOwner(tenantId: string | null, userId: string) {
  owner = tenantId ? { tenantId, userId } : null;
  listeners.forEach(fn => fn());
}
function key() {
  if (!owner) throw new Error("Offline queue requires an authenticated tenant");
  return `meqwat_offline_v2:${owner.tenantId}:${owner.userId}`;
}
const listeners = new Set<() => void>();

function read(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? "[]") as QueuedOp[];
  } catch {
    return [];
  }
}
function write(ops: QueuedOp[]) {
  localStorage.setItem(key(), JSON.stringify(ops));
  listeners.forEach((fn) => fn());
}

export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getQueue(): QueuedOp[] {
  if (typeof window === "undefined") return [];
  return read();
}
export function pendingCount(): number {
  return getQueue().filter((o) => o.status !== "conflict").length;
}

export function enqueue(type: QueuedOp["type"], payload: Record<string, unknown>, label: string): QueuedOp {
  const op: QueuedOp = {
    clientMutationId: typeof payload.clientMutationId === "string" ? payload.clientMutationId : newMutationId(),
    type,
    payload,
    label,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  const prior = read().find(o => o.clientMutationId === op.clientMutationId);
  if (prior) return prior;
  write([op, ...read()]);
  return op;
}

export function removeOp(clientMutationId: string) {
  write(read().filter((o) => o.clientMutationId !== clientMutationId));
}
export function clearResolved() {
  write(read().filter((o) => o.status === "pending" || o.status === "error"));
}

export interface SyncOutcome {
  applied: number;
  duplicates: number;
  conflicts: { op: QueuedOp; error: string }[];
  failed: number;
}

/** Push the queue to /api/sync. Safe to call repeatedly (idempotent server). */
export async function syncQueue(): Promise<SyncOutcome> {
  const scope = owner;
  if (!scope) throw new Error("No queue owner");
  const session = await apiGet<{ user: { id: string; tenantId: string } }>("/api/auth/me");
  if (session.user.id !== scope.userId || session.user.tenantId !== scope.tenantId) throw new Error("Queue belongs to a different session");
  const ops = read().filter((o) => o.status !== "conflict").slice(0, 100);
  const outcome: SyncOutcome = { applied: 0, duplicates: 0, conflicts: [], failed: 0 };
  if (ops.length === 0) return outcome;

  const data = await apiPost<{ results: { clientMutationId: string; status: string; error?: string }[] }>("/api/sync", {
    tenantId: scope.tenantId, userId: scope.userId,
    operations: ops.map((o) => ({ clientMutationId: o.clientMutationId, type: o.type, payload: o.payload })),
  });

  if (owner !== scope) throw new Error("Session changed during synchronization");
  const current = read();
  for (const res of data.results) {
    const idx = current.findIndex((o) => o.clientMutationId === res.clientMutationId);
    if (idx === -1) continue;
    const op = current[idx];
    if (res.status === "applied") {
      outcome.applied++;
      current.splice(idx, 1);
    } else if (res.status === "duplicate") {
      outcome.duplicates++;
      current.splice(idx, 1);
    } else if (res.status === "conflict") {
      outcome.conflicts.push({ op, error: res.error ?? "تعارض" });
      current[idx] = { ...op, status: "conflict", error: res.error, attempts: op.attempts + 1 };
    } else {
      outcome.failed++;
      current[idx] = { ...op, status: "error", error: res.error, attempts: op.attempts + 1 };
    }
  }
  write(current);
  return outcome;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
