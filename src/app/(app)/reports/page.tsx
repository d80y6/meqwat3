"use client";

import { useCallback, useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { apiGet } from "@/lib/client";
import { subMoney, fmtMoney, fmtQty } from "@/lib/money";
import { Btn, Input, PageHeader, TableShell, StatCard, Loading, useToast } from "@/components/ui";
import { TrendingUp, Banknote, Trash2, ReceiptText } from "lucide-react";

interface Report {
  sales: { invoices: number; gross: string; discounts: string; returns: string; cash: string; credit: string } | null;
  cogs: string;
  grossProfit: string;
  topProducts: { productId: string; name: string; qtySold: string; revenue: string; profit: string }[];
  byPayment: { method: string; total: string; count: number }[];
  spoilage: { qty: string; value: string };
  ledger: { type: string; total: string }[];
}

const METHOD_LABEL: Record<string, string> = { cash: "نقدي", credit: "آجل", mixed: "مختلط", transfer: "تحويل" };
const LEDGER_LABEL: Record<string, string> = {
  sale_cash: "مبيعات نقدية", sale_refund: "مرتجعات", customer_payment: "تحصيلات عملاء",
  supplier_payment: "سدادات مورّدين", purchase_cash: "مشتريات نقدية", expense: "مصروفات", adjustment: "تسويات",
};
const PIE_COLORS = ["#346b31", "#d9a441", "#64748b", "#94a3b8"];

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<Report>(`/api/reports?from=${from}T00:00:00&to=${to}T23:59:59`);
      setData(d);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [from, to, toast]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const netRevenue = data ? subMoney(subMoney(data.sales?.gross, data.sales?.discounts), data.sales?.returns) : 0;

  return (
    <div>
      <PageHeader title="التقارير المالية" subtitle="الأرباح والمبيعات والهالك وحركات النقد لفترة محددة" />
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-600">من تاريخ</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto ltr-nums" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-600">إلى تاريخ</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto ltr-nums" /></label>
        <Btn onClick={load} loading={loading}>تحديث التقرير</Btn>
        <div className="flex gap-2">
          {[{ l: "اليوم", f: () => { setFrom(isoDaysAgo(0)); setTo(isoDaysAgo(0)); } }, { l: "٧ أيام", f: () => { setFrom(isoDaysAgo(6)); setTo(isoDaysAgo(0)); } }, { l: "٣٠ يوماً", f: () => { setFrom(isoDaysAgo(29)); setTo(isoDaysAgo(0)); } }].map((p) => (
            <button key={p.l} onClick={p.f} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">{p.l}</button>
          ))}
        </div>
      </div>

      {loading || !data ? <Loading /> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="صافي المبيعات" value={fmtMoney(netRevenue)} sub={`${data.sales?.invoices ?? 0} فاتورة`} icon={<ReceiptText className="h-5 w-5" />} />
            <StatCard label="إجمالي الربح" value={fmtMoney(data.grossProfit)} sub={`تكلفة المباع ${fmtMoney(data.cogs)}`} icon={<TrendingUp className="h-5 w-5" />} tone="blue" />
            <StatCard label="نقدي / آجل" value={`${fmtMoney(data.sales?.cash ?? 0)}`} sub={`آجل: ${fmtMoney(data.sales?.credit ?? 0)}`} icon={<Banknote className="h-5 w-5" />} />
            <StatCard label="خسارة الهالك" value={fmtMoney(data.spoilage.value)} sub={`${fmtQty(data.spoilage.qty)} وحدة تالفة`} icon={<Trash2 className="h-5 w-5" />} tone="red" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-bold">المبيعات حسب طريقة الدفع</h2>
              {data.byPayment.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا مبيعات في الفترة</p> : (
                <div dir="ltr" className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie isAnimationActive={false} data={data.byPayment} dataKey={(d: { total: string }) => Number(d.total)} nameKey="method" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {data.byPayment.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, name) => [`${Number(v).toLocaleString("en-US")} ر.ي`, METHOD_LABEL[String(name)] ?? name]} />
                      <Legend formatter={(v) => METHOD_LABEL[String(v)] ?? v} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {data.ledger.map((l) => (
                  <li key={l.type} className="flex justify-between border-b border-slate-50 py-1.5">
                    <span className="text-slate-500">{LEDGER_LABEL[l.type] ?? l.type}</span>
                    <span className={`tabnums font-semibold ${Number(l.total) < 0 ? "text-red-600" : "text-leaf-700"}`}>{fmtMoney(l.total)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <h2 className="mb-3 font-bold">الأصناف الأكثر ربحاً ومبيعاً</h2>
              <TableShell head={["الصنف", "الكمية المباعة", "الإيراد", "الربح"]}>
                {data.topProducts.map((p) => (
                  <tr key={p.productId} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-4 py-3 tabnums">{fmtQty(p.qtySold)}</td>
                    <td className="px-4 py-3 tabnums">{fmtMoney(p.revenue)}</td>
                    <td className="px-4 py-3 tabnums font-bold text-leaf-700">{fmtMoney(p.profit)}</td>
                  </tr>
                ))}
                {data.topProducts.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">لا مبيعات في الفترة المحددة</td></tr>
                )}
              </TableShell>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">إجمالي الفواتير (قبل الخصم)</p><p className="font-bold tabnums">{fmtMoney(data.sales?.gross ?? 0)}</p></div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">الخصومات</p><p className="font-bold tabnums">{fmtMoney(data.sales?.discounts ?? 0)}</p></div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">المرتجعات</p><p className="font-bold tabnums text-red-600">{fmtMoney(data.sales?.returns ?? 0)}</p></div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">هامش الربح</p><p className="font-bold tabnums">{Number(netRevenue) > 0 ? `${((Number(data.grossProfit) / Number(netRevenue)) * 100).toFixed(1)}%` : "—"}</p></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
