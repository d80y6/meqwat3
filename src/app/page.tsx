"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Leaf, ShoppingCart, WifiOff, Wallet, Boxes, Landmark, ShieldCheck, BarChart3, CheckCircle2, ArrowLeft } from "lucide-react";
import { apiGet } from "@/lib/client";
import { fmtMoney } from "@/lib/money";

interface Plan { id: string; name: string; priceMonthly: string; maxUsers: number; maxProducts: number; maxBranches: number; features: string[] }

const FEATURES = [
  { icon: <ShoppingCart className="h-6 w-6" />, title: "نقطة بيع سريعة", desc: "بيع نقدي وآجل ومختلط خلال ثوانٍ، مصممة لإيقاع سوق القات اليومي." },
  { icon: <WifiOff className="h-6 w-6" />, title: "عمل دون اتصال", desc: "استمر في البيع عند انقطاع الإنترنت؛ تُحفظ العمليات محلياً وتُزامَن بأمان دون تكرار." },
  { icon: <Wallet className="h-6 w-6" />, title: "ديون ومستحقات دقيقة", desc: "تتبع ديون العملاء ومستحقات المورّدين والوكالات بأرصدة محدثة لحظياً." },
  { icon: <Boxes className="h-6 w-6" />, title: "مخزون وهالك يومي", desc: "حركات مخزون موقعة، تسجيل التالف، وجرد يومي يكشف الفروقات فوراً." },
  { icon: <Landmark className="h-6 w-6" />, title: "ورديات ومطابقة نقدية", desc: "فتح وإغلاق الورديات مع مطابقة النقد المتوقع مقابل المعدود وكشف العجز." },
  { icon: <ShieldCheck className="h-6 w-6" />, title: "أمان وعزل كامل", desc: "بيانات كل متجر معزولة تماماً، أدوار وصلاحيات، وسجل تدقيق لكل حركة." },
  { icon: <BarChart3 className="h-6 w-6" />, title: "تقارير وأرباح", desc: "مبيعات وأرباح وهالك حسب الصنف والفترة، لتعرف ربح كل يوم بدقة." },
];

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    apiGet<{ items: Plan[] }>("/api/plans").then((d) => setPlans(d.items)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-leaf-700 text-white"><Leaf className="h-5 w-5" /></div>
            <span className="text-lg font-bold text-slate-900">مقوات</span>
            <span className="hidden text-xs text-slate-400 sm:inline">Meqwat SaaS</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-leaf-800 hover:bg-leaf-50">تسجيل الدخول</Link>
            <Link href="/register" className="rounded-lg bg-leaf-700 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-800">ابدأ الآن</Link>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-b from-leaf-950 via-leaf-900 to-leaf-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-snug sm:text-5xl sm:leading-snug">
            إدارة متاجر القات باحترافية… حتى بدون إنترنت
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-leaf-100 sm:text-lg">
            منصة سحابية متكاملة لتجار القات وأصحاب المحلات في اليمن والقرن الأفريقي: مبيعات، مشتريات، مخزون وهالك، ديون عملاء، مستحقات مورّدين، ورديات ومطابقة نقدية — بدقة مالية كاملة.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-sand-500 px-6 py-3 font-bold text-white shadow-lg hover:bg-amber-600">
              اطلب اشتراك متجرك <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/login" className="rounded-xl bg-white/10 px-6 py-3 font-bold text-white ring-1 ring-white/30 hover:bg-white/20">
              جرّب البيئة التجريبية
            </Link>
          </div>
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-3 text-center">
            {[
              { n: "100%", l: "دقة مالية عشرية" },
              { n: "دون اتصال", l: "مزامنة آمنة لاحقاً" },
              { n: "عزل تام", l: "بيانات كل متجر مستقلة" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/5 px-3 py-4 ring-1 ring-white/10">
                <p className="text-lg font-bold sm:text-2xl">{s.n}</p>
                <p className="mt-1 text-xs text-leaf-200 sm:text-sm">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold text-slate-900">كل ما يحتاجه متجر القات في منصة واحدة</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-3 inline-flex rounded-xl bg-leaf-50 p-3 text-leaf-700">{f.icon}</div>
              <h3 className="font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900">باقات مرنة تنمو مع متجرك</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.length === 0 && <p className="col-span-full text-center text-sm text-slate-400">جارٍ تحميل الباقات…</p>}
            {plans.map((p, i) => (
              <div key={p.id} className={`rounded-2xl border bg-white p-6 shadow-sm ${i === 1 ? "border-leaf-600 ring-2 ring-leaf-100" : "border-slate-200"}`}>
                {i === 1 && <span className="mb-2 inline-block rounded-full bg-leaf-700 px-3 py-0.5 text-xs font-bold text-white">الأكثر شيوعاً</span>}
                <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
                <p className="mt-2 text-3xl font-bold text-leaf-800">{fmtMoney(p.priceMonthly)}<span className="text-sm font-medium text-slate-400"> / شهرياً</span></p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> حتى {p.maxUsers} مستخدمين</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> حتى {p.maxProducts} صنف</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> {p.maxBranches} فرع / صندوق</li>
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-leaf-600" /> {f}</li>
                  ))}
                </ul>
                <Link href={`/register?plan=${p.id}`} className="mt-6 block rounded-lg bg-leaf-700 py-2.5 text-center text-sm font-bold text-white hover:bg-leaf-800">
                  اختر {p.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">
        منصة مقوات © {new Date().getFullYear()} — صُنعت لتجار القات في اليمن والقرن الأفريقي
      </footer>
    </div>
  );
}
