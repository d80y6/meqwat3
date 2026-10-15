import { AsyncLocalStorage } from "node:async_hooks";
export interface DatabaseScope { tenantId: string | null; isAdmin: boolean }
export const databaseScope = new AsyncLocalStorage<DatabaseScope>();
