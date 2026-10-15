"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Wallet, Truck, PackageX, Banknote, ShoppingCart, Landmark, ArrowLeft } from "lucide-react";
import { apiGet } from "@/lib/client";
import { fmtMoney, fmtQty } from "@/lib/money";
import { StatCard, PageHeader, Badge, Loading, EmptyState, Btn } from "@/components/ui";

interface DashData {
  today: { salesCount: number; salesTotal: string; cashCollected: string; creditGiven: string; grossProfit: string };
  receivables: { total: string; debtors: number };
  payables: { total: string; creditors: number };
  cashLedgerBalance: string;
  lowStock: { id: string; name: string; stockQty: string; unit: string; lowStockThreshold: string }[];
  openShifts: { id: string; openingCash: string; openedAt: string }[];
  dailySales: { day: string; total: string; count: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<DashData>("/api/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <Loading label="جارٍ تحميل لوحة التحكم..." />;

  const chartData = data.dailySales.map((d) => ({
    day: new Date(d.day).toLocaleDateString("ar-YE", { weekday: "short" }),
    total: Number(d.total),
    count: d.count,
  }));

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle={`ملخص نشاط اليوم — ${new Date().toLocaleDateString("ar-YE", { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <Link href="/pos"><Btn><ShoppingCart className="h-4 w-4" /> فتح نقطة البيع</Btn></Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="مبيعات اليوم" value={fmtMoney(data.today.salesTotal)} sub={`${data.today.salesCount} فاتورة`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="ربح اليوم التقديري" value={fmtMoney(data.today.grossProfit)} sub="بعد خصم تكلفة الأصناف المباعة" icon={<Banknote className="h-5 w-5" />} tone="blue" />
        <StatCard label="نقد مُحصّل اليوم" value={fmtMoney(data.today.cashCollected)} sub={`آجل اليوم: ${fmtMoney(data.today.creditGiven)}`} icon={<Landmark className="h-5 w-5" />} />
        <StatCard label="ديون العملاء المستحقة" value={fmtMoney(data.receivables.total)} sub={`${data.receivables.debtors} عميل لديه رصيد`} icon={<Wallet className="h-5 w-5" />} tone="amber" />
        <StatCard label="مستحقات المورّدين" value={fmtMoney(data.payables.total)} sub={`${data.payables.creditors} مورّد له مستحقات`} icon={<Truck className="h-5 w-5" />} tone="red" />
        <StatCard label="صافي حركة النقد (الكل)" value={fmtMoney(data.cashLedgerBalance)} sub="مجموع دفتر الحركات المالية" icon={<Banknote className="h-5 w-5" />} tone="blue" />
        <StatCard label="ورديات مفتوحة" value={String(data.openShifts.length)} sub={data.openShifts.length ? "توجد ورديات قيد العمل الآن" : "لا توجد وردية مفتوحة"} icon={<Landmark className="h-5 w-5" />} />
        <StatCard label="أصناف منخفضة المخزون" value={String(data.lowStock.length)} sub="تحتاج إعادة طلب" icon={<PackageX className="h-5 w-5" />} tone="red" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">مبيعات آخر ٧ أيام</h2>
            <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-leaf-700 hover:underline">
              كل التقارير <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
          {chartData.length === 0 ? (
            <EmptyState title="لا توجد مبيعات بعد" hint="ابدأ أول عملية بيع من نقطة البيع وستظهر هنا الرسوم البيانية." />
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString("en-US")} ر.ي`, "المبيعات"]} />
                  <Bar isAnimationActive={false} dataKey="total" fill="#346b31" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">تنبيهات المخزون المنخفض</h2>
          {data.lowStock.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">المخزون بحالة جيدة — لا تنبيهات</p>
          ) : (
            <ul className="space-y-2">
              {data.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-red-50/60 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <Badge tone="red">المتبقي {fmtQty(p.stockQty)} {p.unit}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Link href="/inventory" className="mt-4 block text-center text-sm font-semibold text-leaf-700 hover:underline">إدارة المخزون والهالك</Link>
        </div>
      </div>
    </div>
  );
}
