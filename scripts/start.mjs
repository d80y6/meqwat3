import 'dotenv/config';
import { Pool } from 'pg';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
async function main() {
  if (!process.env.DATABASE_URL || (process.env.AUTH_SECRET?.length ?? 0) < 32) {
    console.error('[startup] DATABASE_URL and a 32+ character AUTH_SECRET are required');
    process.exitCode=1; return;
  }
  const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  try {
    const {rows}=await pool.query('select current_user as name, rolsuper, rolbypassrls from pg_roles where rolname=current_user');
    if(rows[0]?.name!=='meqwat_app'||rows[0].rolsuper||rows[0].rolbypassrls) {
      console.error('[startup] Use restricted meqwat_app credentials, never the schema owner');
      process.exitCode=1;return;
    }
  } catch {
    console.error('[startup] Database preflight failed; verify connectivity and configuration');
    process.exitCode=1;return;
  } finally { await pool.end(); }
  const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','0.0.0.0',...process.argv.slice(2)],{
    stdio:'inherit', env:{...process.env,NODE_ENV:'production'},
  });
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
  child.on('exit',code=>{process.exitCode=code??1;});
  child.on('error',()=>{console.error('[startup] Server process failed');process.exitCode=1;});
}
await main();
