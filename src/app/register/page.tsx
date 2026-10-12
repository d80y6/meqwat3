"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Leaf, CheckCircle2, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/client";

interface Plan { id: string; name: string; priceMonthly: string }

function RegisterForm() {
  const params = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", phone: "", city: "", planId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiGet<{ items: Plan[] }>("/api/plans")
      .then((d) => {
        setPlans(d.items);
        const wanted = params.get("plan");
        setForm((f) => ({ ...f, planId: wanted && d.items.some((p) => p.id === wanted) ? wanted : (d.items[0]?.id ?? "") }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!form.businessName.trim() || !form.ownerName.trim() || !form.phone.trim()) return setError("أكمل اسم المتجر واسم المالك والهاتف");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("أدخل بريداً إلكترونياً صحيحاً");
    setLoading(true);
    try {
      await apiPost("/api/subscription-requests", form);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-14 w-14 text-leaf-600" />
        <h2 className="mt-4 text-xl font-bold text-slate-900">تم استلام طلبك بنجاح</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          سيراجع فريق المنصة طلبك ويُفعّل متجرك خلال يوم عمل واحد، وستصلك بيانات الدخول على بريدك الإلكتروني.
        </p>
        <Link href="/login" className="mt-6 inline-block rounded-lg bg-leaf-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-leaf-800">
          الذهاب لتسجيل الدخول
        </Link>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-100";
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl" noValidate>
      <h2 className="text-center text-lg font-bold text-slate-900">طلب اشتراك متجر جديد</h2>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{error}</div>}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="bn">اسم المتجر *</label>
        <input id="bn" className={inputCls} value={form.businessName} onChange={set("businessName")} placeholder="مثال: متجر النور للقات" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="on">اسم المالك *</label>
          <input id="on" className={inputCls} value={form.ownerName} onChange={set("ownerName")} placeholder="الاسم الكامل" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ph">رقم الهاتف *</label>
          <input id="ph" dir="ltr" className={`${inputCls} text-left`} value={form.phone} onChange={set("phone")} placeholder="77xxxxxxx" required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="em">البريد الإلكتروني *</label>
          <input id="em" type="email" dir="ltr" className={`${inputCls} text-left`} value={form.email} onChange={set("email")} placeholder="you@shop.ye" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ct">المدينة</label>
          <input id="ct" className={inputCls} value={form.city} onChange={set("city")} placeholder="صنعاء، عدن، تعز…" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="pl">الباقة المطلوبة</label>
        <select id="pl" className={inputCls} value={form.planId} onChange={set("planId")}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {Number(p.priceMonthly).toLocaleString("en-US")} ر.ي/شهرياً</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="nt">ملاحظات إضافية</label>
        <textarea id="nt" className={inputCls} rows={2} value={form.notes} onChange={set("notes")} placeholder="عدد الفروع، حجم النشاط، أي متطلبات خاصة…" />
      </div>
      <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-leaf-700 py-2.5 text-sm font-bold text-white hover:bg-leaf-800 disabled:opacity-60">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />} إرسال الطلب
      </button>
      <p className="text-center text-sm text-slate-500">
        لديك حساب؟ <Link className="font-semibold text-leaf-700 hover:underline" href="/login">تسجيل الدخول</Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-leaf-950 via-leaf-900 to-leaf-800 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10"><Leaf className="h-8 w-8" /></div>
          <h1 className="text-2xl font-bold">انضم إلى منصة مقوات</h1>
          <p className="mt-1 text-sm text-leaf-200">أرسل طلبك وسيُفعَّل متجرك مع فترة تجريبية مجانية</p>
        </div>
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
