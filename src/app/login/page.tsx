"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, Lock, Mail, Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") === "suspended" ? "اشتراك المتجر موقوف حالياً" : "");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("أدخل بريداً إلكترونياً صحيحاً");
    if (!password) return setError("أدخل كلمة المرور");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "بيانات الدخول غير صحيحة");
      const role = json.data.user.role as string;
      router.push(role === "platform_admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{error}</div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">البريد الإلكتروني</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-10 text-left text-sm focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-100"
            placeholder="owner@shop.ye" required
          />
        </div>
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">كلمة المرور</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-10 text-left text-sm focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-100"
            placeholder="••••••••" required
          />
        </div>
      </div>
      <button
        type="submit" disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-leaf-700 py-2.5 text-sm font-bold text-white shadow hover:bg-leaf-800 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        تسجيل الدخول
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-leaf-950 via-leaf-900 to-leaf-800 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Leaf className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">منصة مقوات</h1>
          <p className="mt-1 text-sm text-leaf-200">إدارة متاجر القات والتجارة اليومية باحترافية</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="mb-5 text-center text-lg font-bold text-slate-900">تسجيل الدخول إلى متجرك</h2>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
            <Link href="/forgot-password" className="mb-3 block font-semibold text-leaf-700">نسيت كلمة المرور؟</Link>
            ليس لديك متجر؟{" "}
            <Link href="/register" className="font-semibold text-leaf-700 hover:underline">اطلب اشتراكاً جديداً</Link>
          </div>
        </div>
        {process.env.NEXT_PUBLIC_SHOW_DEMO === "true" && <div className="mt-4 rounded-xl bg-white/10 p-4 text-xs leading-6 text-leaf-100">
          <p className="font-semibold text-white">حسابات البيئة التجريبية:</p>
          <p dir="ltr" className="text-left">admin@meqwat.app / Admin@1234</p>
          <p dir="ltr" className="text-left">owner@baraka.ye / Owner@1234</p>
          <p dir="ltr" className="text-left">cashier@baraka.ye / Cashier@1234</p>
        </div>}
      </div>
    </div>
  );
}
