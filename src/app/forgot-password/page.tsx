"use client";
import { useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/client";
export default function ForgotPassword() {
  const [email,setEmail]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  return <main className="mx-auto max-w-md p-6"><h1 className="mb-6 text-2xl font-bold">استعادة كلمة المرور</h1>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await apiPost<{message:string}>("/api/auth/forgot-password",{email});setMessage(r.message);}catch{setMessage("تعذر الاتصال — حاول لاحقاً");}finally{setBusy(false);}}}>
      <label htmlFor="email">البريد الإلكتروني</label><input id="email" className="my-3 w-full rounded border p-3" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
      <button className="rounded bg-leaf-700 p-3 text-white" disabled={busy}>إرسال تعليمات الاستعادة</button>
    </form><p role="status" className="my-4">{message}</p><p className="my-4 text-sm">إذا لم تصلك رسالة، تواصل مع مالك المتجر أو إدارة المنصة.</p><Link href="/login">العودة لتسجيل الدخول</Link></main>;
}
