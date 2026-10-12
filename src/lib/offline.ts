"use client";

import { apiPost, newMutationId } from "./client";

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

const KEY = "meqwat_offline_queue_v1";
const listeners = new Set<() => void>();

function read(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedOp[];
  } catch {
    return [];
  }
}
function write(ops: QueuedOp[]) {
  localStorage.setItem(KEY, JSON.stringify(ops));
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
    clientMutationId: newMutationId(),
    type,
    payload,
    label,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
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
  const ops = read().filter((o) => o.status !== "conflict");
  const outcome: SyncOutcome = { applied: 0, duplicates: 0, conflicts: [], failed: 0 };
  if (ops.length === 0) return outcome;

  const data = await apiPost<{ results: { clientMutationId: string; status: string; error?: string }[] }>("/api/sync", {
    operations: ops.map((o) => ({ clientMutationId: o.clientMutationId, type: o.type, payload: o.payload })),
  });

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
