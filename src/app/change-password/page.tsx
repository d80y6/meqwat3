"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
export default function ChangePassword(){
  const router=useRouter();const [currentPassword,setCurrent]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  return <main className="mx-auto max-w-md p-6"><h1 className="text-2xl font-bold">تغيير كلمة المرور</h1><p className="my-4">يجب تغيير كلمة المرور المؤقتة قبل استخدام المتجر.</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await apiPost('/api/auth/change-password',{currentPassword,password});router.replace('/login');}catch(e){setError(e instanceof Error?e.message:'تعذر التغيير');}finally{setBusy(false);}}}>
      <label htmlFor="current">كلمة المرور الحالية</label><input id="current" type="password" autoComplete="current-password" required className="my-3 w-full rounded border p-3" value={currentPassword} onChange={e=>setCurrent(e.target.value)}/>
      <label htmlFor="new">كلمة المرور الجديدة</label><input id="new" type="password" autoComplete="new-password" required minLength={8} className="my-3 w-full rounded border p-3" value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="rounded bg-leaf-700 p-3 text-white" disabled={busy}>حفظ وتسجيل الدخول مجدداً</button><p role="alert">{error}</p>
    </form></main>;
}
