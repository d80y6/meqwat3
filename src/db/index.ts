import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type QueryConfig } from "pg";
import { databaseScope, type DatabaseScope } from "./context";

const globalForDb = globalThis as typeof globalThis & { __meqwatPool?: Pool };
export const pool = globalForDb.__meqwatPool ?? new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:5432/build_stub",
  connectionTimeoutMillis: 5000,
});
if (process.env.NODE_ENV !== "production") globalForDb.__meqwatPool = pool;

async function scopeClient(client: PoolClient, scope: DatabaseScope) {
  await client.query("select set_config('app.tenant_id',$1,true), set_config('app.is_admin',$2,true)",
    [scope.tenantId ?? "", String(scope.isAdmin)]);
}

/** All standalone Drizzle statements also get transaction-local RLS context.
 * Never set session-wide tenant state on pooled connections. Transactions initialize
 * context immediately after BEGIN; withTenantTx can further narrow it. */
function scopedDatabase(fixed?: DatabaseScope) {
  const current = () => fixed ?? databaseScope.getStore() ?? { tenantId: null, isAdmin: false };
  const client = new Proxy(pool, {
    get(target, property) {
      if (property === "query") return async (query: string | QueryConfig, values?: unknown[]) => {
        const c = await target.connect();
        try {
          await c.query("begin");
          await scopeClient(c, current());
          const result = await c.query(query, values);
          await c.query("commit");
          return result;
        } catch (error) { await c.query("rollback"); throw error; }
        finally { c.release(); }
      };
      if (property === "connect") return async () => {
        const c = await target.connect();
        const scope = current();
        return new Proxy(c, {
          get(connection, key) {
            if (key === "query") return async (query: string | QueryConfig, values?: unknown[]) => {
              const result = await connection.query(query, values);
              const text = typeof query === "string" ? query : query.text;
              if (/^begin\b/i.test(text)) await scopeClient(connection, scope);
              return result;
            };
            const value = Reflect.get(connection, key);
            return typeof value === "function" ? value.bind(connection) : value;
          },
        });
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return drizzle(client);
}
export const db = scopedDatabase();
/** Only authentication/provisioning/public signup may use this explicit context.
 * It is NOT for ordinary tenant queries. RLS defends accidental omissions, not
 * malicious server code with database credentials and ability to set GUCs. */
export const authDb = scopedDatabase({ tenantId: null, isAdmin: true });
