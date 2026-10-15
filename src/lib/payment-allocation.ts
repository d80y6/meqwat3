import { sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentAllocations } from "@/db/schema";
import { ApiError } from "./api";
import { toCents, fromCents } from "./money";
import type { Tx } from "./tx";
export type PaymentSide = "customer_payment" | "supplier_payment";
export interface AllocationInput { invoiceId:string; amount:string | number }
export interface AllocationOptions { allocationMode?: "oldest" | "manual"; allocations?: AllocationInput[] }
export interface SettlementInvoice { id:string; number:string; date:string; outstanding:string; settled:string; refundable:string }

/** One SQL statement calculates immutable invoice facts + active allocations + returns. */
export async function settlementInvoices(connection:typeof db|Tx,tenantId:string,kind:PaymentSide,partyId?:string,invoiceId?:string):Promise<SettlementInvoice[]> {
  const customer=kind==="customer_payment";
  const table=sql.identifier(customer?"sales":"purchases");
  const party=sql.identifier(customer?"customer_id":"supplier_id");
  const reference=sql.identifier(customer?"sale_id":"purchase_id");
  const date=sql.identifier(customer?"sale_date":"purchase_date");
  const credit=customer?sql`i.credit_amount`:sql`i.total_amount-i.paid_amount`;
  const result=await connection.execute(sql`
    select i.id, ${customer?sql`i.invoice_no::text`:sql`i.id::text`} as number, i.${date} as date,
      (${credit}-a.amount-r.debt)::text as outstanding, a.amount::text as settled,
      (i.paid_amount+a.amount-r.cash)::text as refundable
    from ${table} i
    cross join lateral (select coalesce(sum(x.amount),0) amount from payment_allocations x
      where x.tenant_id=i.tenant_id and x.${reference}=i.id and not exists
      (select 1 from payments v where v.tenant_id=x.tenant_id and v.reverses_payment_id=x.payment_id)) a
    cross join lateral (select
      coalesce(sum(p.amount) filter(where p.kind=${customer?'sale_debt_refund':'supplier_debt_refund'}),0) debt,
      coalesce(sum(p.amount) filter(where p.kind=${customer?'sale_refund':'supplier_refund'}),0) cash
      from payments p where p.tenant_id=i.tenant_id and p.${reference}=i.id) r
    where i.tenant_id=${tenantId} ${partyId?sql`and i.${party}=${partyId}`:sql``} ${invoiceId?sql`and i.id=${invoiceId}`:sql``}
    order by i.${date},i.id
  `);
  return result.rows as unknown as SettlementInvoice[];
}
export function isReconciled(rows:SettlementInvoice[],balance:string) {
  return rows.every(r=>toCents(r.outstanding)>=0) && rows.reduce((s,r)=>s+BigInt(toCents(r.outstanding)),0n)===BigInt(toCents(balance));
}
export function planAllocation(rows:SettlementInvoice[],amount:string|number,options:AllocationOptions):AllocationInput[] {
  const mode=options.allocationMode??'oldest';
  if(!['oldest','manual'].includes(mode))throw new ApiError('طريقة تخصيص غير صالحة');
  if(mode==='oldest' && options.allocations!==undefined)throw new ApiError('لا ترسل تخصيصات يدوية مع التخصيص التلقائي');
  let remaining=toCents(amount);
  const selected:AllocationInput[]=[];
  if(mode==='manual') {
    if(!Array.isArray(options.allocations)||!options.allocations.length||options.allocations.length>200)throw new ApiError('اختر الفواتير ومبالغ التخصيص');
    const seen=new Set<string>();
    for(const entry of options.allocations) {
      if(!entry || typeof entry.invoiceId!=='string' || seen.has(entry.invoiceId))throw new ApiError('تخصيص مكرر أو غير صالح');
      seen.add(entry.invoiceId);
      const row=rows.find(r=>r.id===entry.invoiceId);
      if(!row)throw new ApiError('الفاتورة لا تخص هذا الطرف أو المتجر',404);
      const cents=toCents(entry.amount);
      if(cents<=0||cents>toCents(row.outstanding)||cents>remaining)throw new ApiError('التخصيص يتجاوز المستحق أو مبلغ السداد',409);
      selected.push({invoiceId:entry.invoiceId,amount:fromCents(cents)});remaining-=cents;
    }
  } else {
    for(const row of rows) {
      if(!remaining)break;
      const cents=Math.min(remaining,Math.max(0,toCents(row.outstanding)));
      if(cents>0){selected.push({invoiceId:row.id,amount:fromCents(cents)});remaining-=cents;}
    }
  }
  if(remaining!==0)throw new ApiError('مجموع التخصيصات لا يساوي مبلغ السداد',409);
  return selected;
}
export async function insertAllocations(tx:Tx,tenantId:string,paymentId:string,kind:PaymentSide,selected:AllocationInput[]) {
  await tx.insert(paymentAllocations).values(selected.map(a=>({tenantId,paymentId,amount:String(a.amount),saleId:kind==='customer_payment'?a.invoiceId:null,purchaseId:kind==='supplier_payment'?a.invoiceId:null})));
}
