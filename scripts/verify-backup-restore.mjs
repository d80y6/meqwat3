/** Isolated CI drill only. Never reads/writes production. */
import {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const source=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(source.hostname)||!source.pathname.includes('test'))throw Error('Isolated loopback test source required');
const target=new URL(source);target.pathname='/meqwat_restore_drill_test';
if(source.pathname===target.pathname)throw Error('Source and target must differ');
const db=new Pool({connectionString:source.toString()});
try{
  if((await db.query('select 1 from pg_database where datname=$1',[target.pathname.slice(1)])).rowCount)throw Error('Restore target must not already exist');
  await db.query('create database meqwat_restore_drill_test');
}finally{await db.end();}
const dir=mkdtempSync(join(tmpdir(),'meqwat-restore-'));
function run(command,args,env,input){const r=spawnSync(command,args,{env:{...process.env,...env},input,encoding:'utf8'});if(r.status!==0)throw Error('Backup/restore drill command failed');}
run('bash',['scripts/backup.sh',dir],{DATABASE_URL:source.toString()});
const file=readdirSync(dir).find(f=>f.endsWith('.dump'));if(!file)throw Error('Dump not created');
run('bash',['scripts/restore.sh',join(dir,file)],{DATABASE_URL:target.toString()},'RESTORE\n');
async function fingerprint(url){const pool=new Pool({connectionString:url});try{const tables=(await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;const result={};for(const {tablename:t}of tables){if(!/^[a-z_]+$/.test(t))throw Error('Unexpected table name');const rows=(await pool.query(`select row_to_json(t)::text value from "${t}" t order by row_to_json(t)::text`)).rows;result[t]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return result;}finally{await pool.end();}}
const before=await fingerprint(source.toString()),after=await fingerprint(target.toString());
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Restore fingerprint mismatch');
console.log(`PASS backup -> fresh isolated restore: ${Object.keys(before).length} table fingerprints match. Not off-site/PITR/RPO proof.`);
