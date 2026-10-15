import { createHash } from 'node:crypto';
import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { ApiError, requireMutationId } from './api';
import type { Tx } from './tx';
function canonical(v: unknown): string {
  if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;
  if(v&&typeof v==='object')return `{${Object.entries(v).filter(([k,x])=>k!=='clientMutationId'&&x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  return JSON.stringify(v);
}
/** Never return/store secrets from this envelope. Results are sanitized public records. */
export async function adminMutation<T>(actorId:string,action:string,body:Record<string,unknown>,work:(tx:Tx)=>Promise<T>):Promise<T> {
  const key=requireMutationId(body);
  const fingerprint=createHash('sha256').update(canonical({action,body})).digest('hex');
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`admin:${actorId}:${key}`},0))`);
    const existing=await tx.execute(sql`select fingerprint,result from admin_mutations where actor_id=${actorId} and mutation_id=${key}`);
    if(existing.rows[0]){if(existing.rows[0].fingerprint!==fingerprint)throw new ApiError('المعرّف مستخدم لعملية أخرى',409);return existing.rows[0].result as T;}
    const result=await work(tx);
    await tx.insert(auditLogs).values({userId:actorId,action,entityType:'platform',metadata:{mutationId:key}});
    await tx.execute(sql`insert into admin_mutations(actor_id,mutation_id,fingerprint,result) values(${actorId},${key},${fingerprint},${JSON.stringify(result)}::jsonb)`);
    return result;
  });
}
