import "dotenv/config";
import { Pool } from "pg";
async function main() {
const url = new URL(process.env.DATABASE_URL ?? "");
if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.includes('test')) throw new Error('Disposable local test database required');
const password=process.env.TEST_APP_PASSWORD;
if(!password || !/^[a-zA-Z0-9_-]{12,80}$/.test(password)) throw new Error('Set a test-only TEST_APP_PASSWORD');
const pool=new Pool({connectionString:url.toString()});
try {
  if(!(await pool.query("select 1 from pg_roles where rolname='meqwat_app'")).rowCount) await pool.query(`create role meqwat_app login password '${password}'`);
  await pool.query('grant usage on schema public to meqwat_app; grant select,insert,update,delete on all tables in schema public to meqwat_app');
  console.log('Restricted test role provisioned');
} finally {await pool.end();}

}
main().catch(() => { console.error("Restricted test role setup failed"); process.exitCode=1; });
