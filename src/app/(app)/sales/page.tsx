"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, RotateCcw, Printer } from "lucide-react";
import { apiCollection, apiPost } from "@/lib/client";
import { subMoney, fmtMoney, fmtQty } from "@/lib/money";
import { Btn, Field, Input, Select, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface SaleItemRow { id: string; productName: string; unit: string; qty: string; returnedQty: string; unitPrice: string; total: string }
interface Sale {
  id: string; invoiceNo: number; customerName: string | null; totalAmount: string; discount: string;
  paidAmount: string; creditAmount: string; returnedAmount: string; paymentMethod: string;
  status: string; saleDate: string; source: string; items: SaleItemRow[];
}

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  completed: { label: "مكتملة", tone: "green" },
  partially_returned: { label: "مرتجع جزئي", tone: "amber" },
  returned: { label: "مرتجعة", tone: "red" },
  reversed: { label: "ملغاة", tone: "slate" },
};
const METHOD: Record<string, string> = { cash: "نقدي", credit: "آجل", mixed: "مختلط", transfer: "تحويل" };

export default function SalesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [refundMethod, setRefundMethod] = useState<"cash" | "debt">("cash");
  const [savingReturn, setSavingReturn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiCollection<Sale>("/api/sales?limit=50");
      setItems(d.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  function openReturn(sale: Sale) {
    setReturnFor(sale);
    setReturnQtys({});
    setRestock({});
    setRefundMethod(sale.customerName ? "debt" : "cash");
  }

  async function submitReturn() {
    if (!returnFor) return;
    const lines = returnFor.items
      .filter((it) => Number(returnQtys[it.id] ?? 0) > 0)
      .map((it) => ({ saleItemId: it.id, qty: returnQtys[it.id], restock: restock[it.id] !== false }));
    if (lines.length === 0) return toast.push("error", "أدخل كمية الإرجاع لصنف واحد على الأقل");
    setSavingReturn(true);
    try {
      const res = await apiPost<{ refundAmount: string }>(`/api/sales/${returnFor.id}/return`, { items: lines, refundMethod });
      toast.push("success", `تم تنفيذ الإرجاع — قيمة المسترد ${fmtMoney(res.refundAmount)}`);
      setReturnFor(null);
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر تنفيذ الإرجاع"); }
    finally { setSavingReturn(false); }
  }

  return (
    <div>
      <PageHeader title="المبيعات والفواتير" subtitle="سجل فواتير البيع المؤكدة على الخادم وإدارة المرتجعات" />
      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا توجد مبيعات مؤكدة بعد" hint="الفواتير الصادرة من نقطة البيع (المتصلة أو بعد مزامنتها) تظهر هنا." />
      ) : (
        <TableShell head={["الفاتورة", "العميل", "الإجمالي", "المدفوع", "الآجل", "طريقة الدفع", "الحالة", ""]}>
          {items.map((s) => (
            <Fragment key={s.id}>
              <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <p className="font-bold tabnums">#{s.invoiceNo}</p>
                  <p className="text-xs text-slate-400">{new Date(s.saleDate).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" })}{s.source !== "web" ? ` · ${s.source === "pos" ? "نقطة بيع" : "دون اتصال"}` : ""}</p>
                </td>
                <td className="px-4 py-3">{s.customerName ?? <span className="text-slate-400">نقدي</span>}</td>
                <td className="px-4 py-3 tabnums font-semibold">{fmtMoney(subMoney(s.totalAmount, s.discount))}</td>
                <td className="px-4 py-3 tabnums text-leaf-700">{fmtMoney(s.paidAmount)}</td>
                <td className="px-4 py-3 tabnums">{Number(s.creditAmount) > 0 ? fmtMoney(s.creditAmount) : "—"}</td>
                <td className="px-4 py-3">{METHOD[s.paymentMethod] ?? s.paymentMethod}</td>
                <td className="px-4 py-3"><Badge tone={STATUS[s.status]?.tone ?? "slate"}>{STATUS[s.status]?.label ?? s.status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="عرض البنود">
                      {expanded === s.id ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </button>
                    {s.status !== "returned" && s.status !== "reversed" && (
                      <button onClick={() => openReturn(s)} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
                        <RotateCcw className="h-3.5 w-3.5" /> إرجاع
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {expanded === s.id && (
                <tr key={`${s.id}-items`} className="bg-slate-50/60">
                  <td colSpan={8} className="px-6 py-3">
                    <ul className="space-y-1 text-sm">
                      {s.items.map((it) => (
                        <li key={it.id} className="flex justify-between">
                          <span>{it.productName} — {fmtQty(it.qty)} {it.unit} × {fmtMoney(it.unitPrice)}{Number(it.returnedQty) > 0 ? ` (مُرجع ${fmtQty(it.returnedQty)})` : ""}</span>
                          <span className="tabnums font-semibold">{fmtMoney(it.total)}</span>
                        </li>
                      ))}
                    </ul>
                    {Number(s.returnedAmount) > 0 && <p className="mt-2 text-xs text-red-600">إجمالي المرتجعات: {fmtMoney(s.returnedAmount)}</p>}
                    <button onClick={() => window.print()} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 no-print">
                      <Printer className="h-3.5 w-3.5" /> طباعة الفاتورة
                    </button>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </TableShell>
      )}

      <Modal open={!!returnFor} onClose={() => setReturnFor(null)} title={`إرجاع من فاتورة #${returnFor?.invoiceNo ?? ""}`} wide>
        {returnFor && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">حدّد كمية الإرجاع لكل صنف. الأصناف الصالحة تُعاد للمخزون، والذابلة تُسجَّل كهالك دون إعادة بيع.</p>
            <div className="space-y-2">
              {returnFor.items.map((it) => {
                const available = Number(it.qty) - Number(it.returnedQty);
                return (
                  <div key={it.id} className="grid grid-cols-12 items-center gap-2 rounded-xl bg-slate-50 p-3">
                    <div className="col-span-4">
                      <p className="font-semibold text-sm">{it.productName}</p>
                      <p className="text-xs text-slate-400">مباع {fmtQty(it.qty)} · متاح للإرجاع {fmtQty(available)}</p>
                    </div>
                    <div className="col-span-3">
                      <Input type="number" min="0" max={available} step="0.5" value={returnQtys[it.id] ?? ""} onChange={(e) => setReturnQtys({ ...returnQtys, [it.id]: e.target.value })} className="ltr-nums" placeholder="كمية الإرجاع" aria-label="كمية الإرجاع" />
                    </div>
                    <label className="col-span-5 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={restock[it.id] !== false} onChange={(e) => setRestock({ ...restock, [it.id]: e.target.checked })} className="h-4 w-4 accent-leaf-700" />
                      صالح لإعادة البيع (إرجاع للمخزون)
                    </label>
                  </div>
                );
              })}
            </div>
            <Field label="طريقة ردّ القيمة">
              <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as "cash" | "debt")}>
                <option value="cash">نقداً من الدرج</option>
                <option value="debt" disabled={!returnFor.customerName}>تخفيض دين العميل{!returnFor.customerName ? " (لا يوجد عميل)" : ""}</option>
              </Select>
            </Field>
            <div className="flex gap-2">
              <Btn onClick={submitReturn} loading={savingReturn} className="flex-1">تنفيذ الإرجاع</Btn>
              <Btn variant="secondary" onClick={() => setReturnFor(null)}>إلغاء</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
