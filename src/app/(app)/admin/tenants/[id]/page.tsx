"use client";
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { subMoney,fmtMoney } from '@/lib/money';
import { apiGet,apiPost } from '@/lib/client';
import { Btn,PageHeader,TableShell,Loading,useToast,Input,Field,Select } from '@/components/ui';
interface Invoice {id:string;description:string;amount:string;received:string;due_at:string}
interface Receipt {id:string;invoice_id:string;kind:string;amount:string;reference:string;created_at:string}
interface Detail {tenant:{name:string;status:string;phone:string|null;city:string|null};usage:{products:number};users:{id:string;name:string;email:string;role:string;isActive:boolean;activeSessions:number;mustChangePassword:boolean}[];subscriptions:{subscription:{id:string;status:string;endsAt:string|null};planName:string}[];events:{id:string;action:string;createdAt:string;metadata:unknown}[]}
export default function TenantDetail({params}:{params:Promise<{id:string}>}){
 const {id}=use(params);const toast=useToast();const [data,setData]=useState<Detail|null>(null);const [busy,setBusy]=useState(false);
 const [invoices,setInvoices]=useState<Invoice[]>([]);const [receipts,setReceipts]=useState<Receipt[]>([]);const [page,setPage]=useState(0);const [total,setTotal]=useState(0);
 const [billing,setBilling]=useState({action:'invoice',amount:'',description:'',dueAt:'',invoiceId:'',reference:''});
 const load=useCallback(async()=>{try{setData(await apiGet<Detail>(`/api/admin/tenants/${id}`));
 const billed=await apiGet<{items:Invoice[];receipts:Receipt[];total:number}>(`/api/admin/tenants/${id}/billing?limit=25&offset=${page*25}`);setInvoices(billed.items);setReceipts(billed.receipts);setTotal(billed.total);}catch(e){toast.push('error',String(e));}},[id,toast,page]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function act(userId:string,action:string,role?:string){if(!confirm('تأكيد تنفيذ الإجراء؟'))return;setBusy(true);try{const res=await apiPost<{sent?:boolean}>(`/api/admin/tenants/${id}/users`,{userId,action,role});toast.push(res.sent===false?'error':'success',action==='reset'?(res.sent?'أُرسل رابط الاستعادة':'تعذر إرسال البريد — راجع إعدادات SMTP'):'تم التنفيذ وإلغاء الجلسات');await load();}catch(e){toast.push('error',String(e));}finally{setBusy(false);}}
 async function postBilling(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);try{await apiPost(`/api/admin/tenants/${id}/billing`,billing);setBilling({...billing,amount:'',reference:''});await load();toast.push('success','سُجل المستند — لا يتم تمديد الاشتراك تلقائياً');}catch(e){toast.push('error',String(e));}finally{setBusy(false);}}
 if(!data)return <Loading/>;
 return <div><Link href="/admin" className="underline">إدارة المنصة</Link><PageHeader title={data.tenant.name} subtitle={`${data.tenant.status} · ${data.tenant.city??''} · ${data.tenant.phone??''}`} />
 <p className="mb-4">الأصناف: {data.usage.products} — المستخدمون: {data.users.length}</p>
 <h2 className="my-3 font-bold">المستخدمون والجلسات</h2><TableShell head={['الاسم','البريد','الدور','الحالة / الجلسات','إجراءات']}>{data.users.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><select aria-label={`دور ${u.name}`} disabled={busy} value={u.role} onChange={e=>void act(u.id,'role',e.target.value)}>{['tenant_owner','manager','cashier'].map(r=><option key={r}>{r}</option>)}</select></td><td>{u.isActive?'نشط':'معطل'} / {u.activeSessions}{u.mustChangePassword?' · تغيير كلمة المرور مطلوب':''}</td><td className="flex flex-wrap gap-2 p-2"><Btn disabled={busy} onClick={()=>void act(u.id,'revoke')}>إلغاء الجلسات</Btn><Btn disabled={busy} variant="secondary" onClick={()=>void act(u.id,'reset')}>إرسال استعادة</Btn><Btn disabled={busy} variant={u.isActive?'danger':'secondary'} onClick={()=>void act(u.id,u.isActive?'disable':'activate')}>{u.isActive?'تعطيل':'تفعيل'}</Btn></td></tr>)}</TableShell>
 <h2 className="my-3 font-bold">الاشتراكات</h2><TableShell head={['الباقة','الحالة','الانتهاء']}>{data.subscriptions.map(s=><tr key={s.subscription.id}><td>{s.planName}</td><td>{s.subscription.status}</td><td>{s.subscription.endsAt?new Date(s.subscription.endsAt).toLocaleDateString('ar-YE'):'—'}</td></tr>)}</TableShell>
 <h2 className="my-3 font-bold">فواتير اشتراك المنصة والتحصيل اليدوي</h2>
 <p className="mb-3 text-sm">بالريال اليمني، منفصلة عن نقد المتجر. التحصيل يؤكد تسجيلك لدفعة خارج النظام، وليس تحققاً بنكياً. الاسترداد يعيد الرصيد المستحق ولا يلغي الفاتورة أو الاشتراك.</p>
 <TableShell head={['المستند','المبلغ','المحصل الصافي','المتبقي','الاستحقاق']}>{invoices.map(i=><tr key={i.id}><td><button className="underline" onClick={()=>setBilling({...billing,action:'payment',invoiceId:i.id})}>{i.description}</button><small className="block">{i.id}</small></td><td>{fmtMoney(i.amount)}</td><td>{fmtMoney(i.received)}</td><td>{fmtMoney(subMoney(i.amount,i.received))}</td><td>{new Date(i.due_at).toLocaleDateString('ar-YE')}</td></tr>)}</TableShell>
 <div className="my-2 flex gap-2"><Btn disabled={page===0} onClick={()=>setPage(page-1)}>السابق</Btn><span>{total} فاتورة</span><Btn disabled={(page+1)*25>=total} onClick={()=>setPage(page+1)}>التالي</Btn></div>
 <form onSubmit={postBilling} className="my-4 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
 <Field label="الإجراء"><Select value={billing.action} onChange={e=>setBilling({...billing,action:e.target.value})}><option value="invoice">إصدار فاتورة</option><option value="payment">تسجيل تحصيل</option><option value="refund">تسجيل استرداد</option></Select></Field>
 <Field label="المبلغ"><Input required value={billing.amount} onChange={e=>setBilling({...billing,amount:e.target.value})}/></Field>
 {billing.action==='invoice'?<><Field label="وصف الفاتورة"><Input required value={billing.description} onChange={e=>setBilling({...billing,description:e.target.value})}/></Field><Field label="الاستحقاق"><Input required type="date" value={billing.dueAt} onChange={e=>setBilling({...billing,dueAt:e.target.value})}/></Field></>:<><Field label="معرّف الفاتورة (اختر من القائمة أو ألصق المعرّف)"><Input required value={billing.invoiceId} onChange={e=>setBilling({...billing,invoiceId:e.target.value})}/></Field><Field label="مرجع التحصيل / سبب الاسترداد"><Input required value={billing.reference} onChange={e=>setBilling({...billing,reference:e.target.value})}/></Field></>}
 <Btn type="submit" disabled={busy}>تسجيل مستند مالي</Btn></form>
 <h3 className="my-2 font-bold">آخر ٢٠٠ سند تحصيل / استرداد</h3><TableShell head={['النوع','المبلغ','المرجع','الفاتورة']}>{receipts.map(r=><tr key={r.id}><td>{r.kind==='payment'?'تحصيل':'استرداد'}</td><td>{fmtMoney(r.amount)}</td><td>{r.reference}</td><td>{r.invoice_id}</td></tr>)}</TableShell>
 <h2 className="my-3 font-bold">آخر ٥٠ إجراء — سجل التغييرات والتسليم</h2>{data.events.map(e=><details key={e.id} className="my-2 rounded border bg-white p-3"><summary>{new Date(e.createdAt).toLocaleString('ar-YE')} · {e.action}</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(e.metadata,null,2)}</pre></details>)}
 </div>;
}
