"use client";
import { useEffect, useState } from "react";
import { apiGet,apiPost } from "@/lib/client";
import { toCents,fmtMoney } from "@/lib/money";
import { Modal,Field,Input,Select,Btn,useToast } from "@/components/ui";
import type { SettlementInvoice } from "@/lib/payment-allocation";
export interface PaymentTarget { party:{id:string;name:string;balance:string};kind:"customer_payment"|"supplier_payment";paymentId?:string;amount?:string }
export function PaymentSettlement({target,onClose,onSaved}:{target:PaymentTarget|null;onClose:()=>void;onSaved:()=>void}) {
 const toast=useToast();
 const [invoices,setInvoices]=useState<SettlementInvoice[]>([]),[amount,setAmount]=useState(target?.amount??target?.party.balance??''),[mode,setMode]=useState('oldest'),[selected,setSelected]=useState<Record<string,string>>({}),[reason,setReason]=useState('');
 const [ready,setReady]=useState(false),[reconciled,setReconciled]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let current=true;
  if(target)apiGet<{items:SettlementInvoice[];reconciled:boolean}>(`/api/payments/invoices?kind=${target.kind}&partyId=${target.party.id}`).then(data=>{if(current){setInvoices(data.items);setReconciled(data.reconciled);setReady(true);}}).catch(e=>{if(current)toast.push('error',e.message);});
  return()=>{current=false;};
 },[target,toast]);
 async function submit(){
  if(!target)return;
  try {
   if(toCents(amount)<=0)throw Error('أدخل مبلغاً موجباً');
   const allocations=mode==='manual'?Object.entries(selected).filter(([,v])=>v.trim()!==''&&toCents(v)>0).map(([invoiceId,v])=>({invoiceId,amount:v})):undefined;
   if(allocations&&allocations.reduce((s,a)=>s+BigInt(toCents(a.amount)),0n)!==BigInt(toCents(amount)))throw Error('مجموع التخصيصات يجب أن يساوي السداد');
   setBusy(true);
   await apiPost(target.paymentId?`/api/payments/${target.paymentId}/allocate`:'/api/payments',target.paymentId?{allocationMode:mode,allocations,reason}:{kind:target.kind,customerId:target.kind==='customer_payment'?target.party.id:undefined,supplierId:target.kind==='supplier_payment'?target.party.id:undefined,amount,allocationMode:mode,allocations});
   toast.push('success',target.paymentId?'حُفظت المراجعة دون تغيير الأرصدة':'سُجل السداد وتخصيص الفواتير');onClose();onSaved();
  }catch(e){toast.push('error',e instanceof Error?e.message:'تعذر الحفظ');}finally{setBusy(false);}
 }
 return <Modal open={!!target} onClose={()=>{if(!busy)onClose();}} title={target?.paymentId?'مراجعة تخصيص سداد تاريخي':`سداد — ${target?.party.name??''}`}>
  <div className="space-y-4">
   {!ready?<p>جارٍ تحميل الفواتير…</p>:!reconciled&&!target?.paymentId?<p role="alert" className="text-red-700">الرصيد لا يطابق الفواتير. يجب على المالك مراجعة تخصيص المدفوعات التاريخية من سجل المدفوعات قبل سداد جديد.</p>:null}
   <Field label="المبلغ"><Input value={amount} disabled={busy||!!target?.paymentId} inputMode="decimal" onChange={e=>setAmount(e.target.value)}/></Field>
   <Field label="تخصيص الفواتير"><Select value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="oldest">الأقدم أولاً</option><option value="manual">اختيار يدوي</option></Select></Field>
   <div className="max-h-64 space-y-2 overflow-auto">{invoices.filter(i=>toCents(i.outstanding)>0).map(i=><div key={i.id} className="rounded-lg border p-2 text-sm"><p>فاتورة {i.number} — {new Date(i.date).toLocaleDateString('ar-YE')} — المتبقي {fmtMoney(i.outstanding)}</p>{mode==='manual'&&<Input aria-label={`تخصيص ${i.number}`} inputMode="decimal" value={selected[i.id]??''} disabled={busy} placeholder="0.00" onChange={e=>setSelected({...selected,[i.id]:e.target.value})}/>}</div>)}</div>
   {target?.paymentId&&<Field label="سبب المراجعة / مرجع المستند"><Input value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/></Field>}
   <Btn onClick={submit} disabled={busy||!ready||(!reconciled&&!target?.paymentId)}>{busy?'جارٍ الحفظ…':'تأكيد'}</Btn>
  </div>
 </Modal>;
}
interface Detail { payment:{id:string;kind:string;amount:string;method:string;customerId:string|null;supplierId:string|null;saleId:string|null;purchaseId:string|null;notes:string|null};allocations:{id:string;saleId:string|null;purchaseId:string|null;amount:string}[];reversal:{id:string}|null }
export function PaymentReceipt({id,onClose,onSaved,onReconcile}:{id:string|null;onClose:()=>void;onSaved:()=>void;onReconcile:(target:PaymentTarget)=>void}) {
 const toast=useToast(),[detail,setDetail]=useState<Detail|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[owner,setOwner]=useState(false);
 useEffect(()=>{let current=true;if(id)Promise.all([apiGet<Detail>(`/api/payments/${id}`),apiGet<{user:{role:string}}>('/api/auth/me')]).then(([d,me])=>{if(current){setDetail(d);setOwner(me.user.role==='tenant_owner');}}).catch(e=>{if(current)toast.push('error',e.message);});return()=>{current=false;};},[id,toast]);
 const p=detail?.payment,eligible=!!p&&['customer_payment','supplier_payment'].includes(p.kind)&&!p.saleId&&!p.purchaseId&&!detail?.reversal;
 async function reverse(){if(!id)return;try{setBusy(true);await apiPost(`/api/payments/${id}/reverse`,{reason});toast.push('success','سُجل قيد عكسي؛ السداد الأصلي محفوظ');onClose();onSaved();}catch(e){toast.push('error',e instanceof Error?e.message:'تعذر العكس');}finally{setBusy(false);}}
 return <Modal open={!!id} onClose={()=>{if(!busy)onClose();}} title="تفاصيل السداد والتخصيص"><div className="space-y-3">
  {p?<><p>{fmtMoney(p.amount)} — {p.method}</p><p>{p.notes}</p>{detail?.reversal&&<p role="status">سداد معكوس — {detail.reversal.id}</p>}
   {detail?.allocations.map(a=><p key={a.id}>فاتورة {a.saleId??a.purchaseId}: {fmtMoney(a.amount)}</p>)}
   {eligible&&detail?.allocations.length===0&&<><p>سداد تاريخي غير مخصص. يلزم توثيق مراجعة المالك.</p>{owner&&<Btn onClick={()=>{onClose();onReconcile({party:{id:(p.customerId??p.supplierId)!,name:'مراجعة تاريخية',balance:'0'},kind:p.kind as PaymentTarget['kind'],paymentId:p.id,amount:p.amount});}}>مراجعة التخصيص</Btn>}</>}
   {eligible&&!!detail?.allocations.length&&<><Field label="سبب عكس السداد بالكامل"><Input maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></Field><p className="text-xs">العكس قيد جديد الآن، ولا يعدل وردية سابقة. لا يُسمح بعكس مبالغ استُخدمت لمرتجع.</p><Btn disabled={busy||!reason.trim()} onClick={reverse}>عكس السداد بالكامل</Btn></>}
  </>:<p>جارٍ التحميل…</p>}
 </div></Modal>;
}
