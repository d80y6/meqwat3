"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/client";
function ResetForm() {
  const token=useSearchParams().get("token"); const [password,setPassword]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  return <main className="mx-auto max-w-md p-6"><h1 className="mb-6 text-2xl font-bold">تعيين كلمة مرور جديدة</h1><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await apiPost("/api/auth/reset-password",{token,password});setMessage("تم تغيير كلمة المرور. سجّل الدخول مجدداً.");setPassword("");}catch(e){setMessage(e instanceof Error?e.message:"تعذر تغيير كلمة المرور");}finally{setBusy(false);}}}>
    <label htmlFor="password">كلمة المرور الجديدة</label><input id="password" type="password" autoComplete="new-password" minLength={8} required className="my-3 w-full rounded border p-3" value={password} onChange={e=>setPassword(e.target.value)}/>
    <button disabled={busy||!token} className="rounded bg-leaf-700 p-3 text-white">حفظ كلمة المرور</button></form><p role="status" className="my-4">{message}</p><Link href="/login">تسجيل الدخول</Link></main>;
}
export default function ResetPassword(){return <Suspense><ResetForm/></Suspense>;}
