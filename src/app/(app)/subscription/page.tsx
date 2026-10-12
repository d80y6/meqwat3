"use client";

import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, Send } from "lucide-react";
import { apiGet, apiPost } from "@/lib/client";
import { fmtMoney } from "@/lib/money";
import { Btn, Field, Select, Textarea, PageHeader, Badge, Loading, useToast } from "@/components/ui";

interface MeData {
  tenant: { id: string; name: string; isDemo: boolean } | null;
  subscription: { planName: string; status: string; endsAt: string | null } | null;
}
interface Plan { id: string; name: string; priceMonthly: string; maxUsers: number; maxProducts: number; features: string[] }

const STATUS_LABEL: Record<string, string> = { trial: "تجريبي", active: "نشط", past_due: "متأخر السداد", cancelled: "ملغي", expired: "منتهي" };

export default function SubscriptionPage() {
  const toast = useToast();
  const [me, setMe] = useState<MeData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [wantedPlan, setWantedPlan] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiGet<MeData>("/api/auth/me").then(setMe).catch(() => {});
    apiGet<{ plans: Plan[] }>("/api/subscription-requests").then((d) => setPlans(d.plans)).catch(() => {});
  }, []);

  async function requestChange() {
    if (!wantedPlan) return toast.push("error", "اختر الباقة المطلوبة");
    setSending(true);
    try {
      // Upgrade requests are tracked as subscription requests linked to the tenant by admin review;
      // include identifying details in notes so the platform team can act on them.
      await apiPost("/api/subscription-requests", {
        businessName: me?.tenant?.name ?? "متجر",
        ownerName: "طلب ترقية من لوحة المتجر",
        email: "upgrade@internal",
        phone: "-",
        planId: wantedPlan,
        notes: `طلب تغيير باقة لمتجر (${me?.tenant?.id ?? ""}): ${notes}`,
      }).catch(() => { throw new Error(" تعذر إرسال الطلب — تواصل مع دعم المنصة"); });
      toast.push("success", "تم إرسال طلب تغيير الباقة — سيتواصل معك فريق المنصة");
      setNotes("");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message.trim() : "تعذر الإرسال");
    } finally { setSending(false); }
  }

  if (!me) return <Loading />;

  const daysLeft = me.subscription?.endsAt ? Math.ceil((new Date(me.subscription.endsAt).getTime() - Date.now()) / 86400_000) : null;

  return (
    <div>
      <PageHeader title="الاشتراك والباقة" subtitle="باقة متجرك الحالية وطلبات الترقية والتجديد" />
      <div className="rounded-2xl border border-leaf-200 bg-leaf-50 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-leaf-700 text-white"><CreditCard className="h-6 w-6" /></div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">الباقة الحالية</p>
            <p className="text-xl font-bold text-slate-900">{me.subscription?.planName ?? "—"}</p>
          </div>
          <Badge tone={me.subscription?.status === "active" ? "green" : me.subscription?.status === "trial" ? "amber" : "red"}>
            {STATUS_LABEL[me.subscription?.status ?? ""] ?? me.subscription?.status}
          </Badge>
          {me.subscription?.endsAt && (
            <div className="text-sm text-slate-600">
              ينتهي في {new Date(me.subscription.endsAt).toLocaleDateString("ar-YE")}
              {daysLeft !== null && <span className={daysLeft <= 7 ? "font-bold text-red-600" : ""}> — متبقٍ {daysLeft} يوم</span>}
            </div>
          )}
          {me.tenant?.isDemo && <Badge tone="amber">بيئة تجريبية</Badge>}
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-bold text-slate-900">الباقات المتاحة</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = me.subscription?.planName === p.name;
          return (
            <div key={p.id} className={`rounded-2xl border bg-white p-5 ${current ? "border-leaf-600 ring-2 ring-leaf-100" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{p.name}</h3>
                {current && <Badge tone="green">باقتك الحالية</Badge>}
              </div>
              <p className="mt-2 text-2xl font-bold text-leaf-800">{fmtMoney(p.priceMonthly)}<span className="text-sm text-slate-400"> / شهر</span></p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-leaf-600" /> حتى {p.maxUsers} مستخدمين، {p.maxProducts} صنف</li>
                {p.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-leaf-600" /> {f}</li>)}
              </ul>
              {!current && (
                <button onClick={() => setWantedPlan(p.id)} className={`mt-4 w-full rounded-lg py-2 text-sm font-bold ${wantedPlan === p.id ? "bg-leaf-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                  {wantedPlan === p.id ? "محددة للطلب" : "اختيار هذه الباقة"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-bold">طلب تغيير الباقة / التجديد</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="الباقة المطلوبة">
            <Select value={wantedPlan} onChange={(e) => setWantedPlan(e.target.value)}>
              <option value="">— اختر —</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="ملاحظات لفريق المنصة">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="طريقة الدفع المفضلة، مدة الاشتراك…" />
          </Field>
        </div>
        <Btn onClick={requestChange} loading={sending} className="mt-4"><Send className="h-4 w-4" /> إرسال الطلب إلى إدارة المنصة</Btn>
      </div>
    </div>
  );
}
