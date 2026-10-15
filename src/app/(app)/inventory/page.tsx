"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, ClipboardCheck, PackageSearch } from "lucide-react";
import { apiGet, apiPost } from "@/lib/client";
import { fmtMoney, fmtQty } from "@/lib/money";
import { Btn, Field, Input, Select, Textarea, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface StockRow { id: string; name: string; unit: string; stockQty: string; costPrice: string; lowStockThreshold: string; trackStock: boolean }
interface Move { id: string; productName: string; unit: string; type: string; qty: string; balanceAfter: string; notes: string | null; createdAt: string; refType: string | null }
interface DailyRow { productId: string; productName: string; unit: string; purchased: string; sold: string; spoiled: string; closing: string | null }

const TYPE_LABEL: Record<string, { label: string; tone: "green" | "red" | "amber" | "slate" | "blue" }> = {
  opening: { label: "افتتاحي", tone: "slate" },
  purchase: { label: "شراء", tone: "green" },
  sale: { label: "بيع", tone: "blue" },
  sale_return: { label: "مرتجع", tone: "green" },
  purchase_return: { label: "مرتجع شراء", tone: "amber" },
  spoilage: { label: "هالك", tone: "red" },
  adjustment: { label: "تسوية جرد", tone: "amber" },
};

export default function InventoryPage() {
  const toast = useToast();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<{ type: "spoilage" | "adjustment"; product: StockRow } | null>(null);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ stock: StockRow[]; movements: Move[]; daily: DailyRow[] }>(
        `/api/inventory?limit=60&day=${day}${typeFilter ? `&type=${typeFilter}` : ""}`,
      );
      setStock(d.stock);
      setMoves(d.movements);
      setDaily(d.daily);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [day, typeFilter, toast]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function submitAction() {
    if (!action) return;
    if (!qty || Number(qty) < 0 || (action.type === "spoilage" && Number(qty) <= 0)) {
      return toast.push("error", "أدخل كمية صحيحة");
    }
    setSaving(true);
    try {
      const res = await apiPost<{ newStock: string }>("/api/inventory", {
        productId: action.product.id, type: action.type, qty, notes: notes || undefined,
      });
      toast.push("success", action.type === "spoilage" ? `سُجّل الهالك — المخزون الجديد ${fmtQty(res.newStock)}` : `تمت التسوية — المخزون ${fmtQty(res.newStock)}`);
      setAction(null);
      setQty("");
      setNotes("");
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التنفيذ"); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="المخزون والهالك اليومي" subtitle="أرصدة الأصناف، حركات المخزون الموقعة، وتسجيل التالف والجرد" />

      {loading && stock.length === 0 ? <Loading /> : (
        <>
          <h2 className="mb-3 font-bold text-slate-900">أرصدة المخزون الحالية</h2>
          {stock.length === 0 ? (
            <EmptyState title="لا توجد أصناف" hint="أضف أصنافاً من صفحة الأصناف أولاً." />
          ) : (
            <TableShell head={["الصنف", "المخزون", "متوسط التكلفة", "قيمة المخزون", "إجراءات"]}>
              {stock.map((p) => {
                const low = p.trackStock && Number(p.stockQty) <= Number(p.lowStockThreshold);
                return (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-4 py-3">{p.trackStock ? <Badge tone={low ? "red" : "green"}>{fmtQty(p.stockQty)} {p.unit}</Badge> : <span className="text-slate-400">لا يُتتبع</span>}</td>
                    <td className="px-4 py-3 tabnums">{fmtMoney(p.costPrice)}</td>
                    <td className="px-4 py-3 tabnums">{fmtMoney(Number(p.stockQty) * Number(p.costPrice))}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setAction({ type: "spoilage", product: p }); setQty(""); }} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /> تسجيل هالك</button>
                        <button onClick={() => { setAction({ type: "adjustment", product: p }); setQty(p.stockQty); }} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"><ClipboardCheck className="h-3.5 w-3.5" /> جرد</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </TableShell>
          )}

          <div className="mt-8 mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-slate-900">المخزون اليومي</h2>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-auto ltr-nums" aria-label="اختيار اليوم" />
            <span className="text-xs text-slate-400">المشتريات والمبيعات والهالك والإقفال لكل صنف في هذا اليوم</span>
          </div>
          {daily.length === 0 ? (
            <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-100">لا حركات مخزون في هذا اليوم</p>
          ) : (
            <TableShell head={["الصنف", "مشتريات/مرتجعات", "مبيعات", "هالك", "رصيد الإقفال"]}>
              {daily.map((d) => (
                <tr key={d.productId} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-semibold">{d.productName}</td>
                  <td className="px-4 py-3 tabnums text-leaf-700">+{fmtQty(d.purchased)}</td>
                  <td className="px-4 py-3 tabnums">{fmtQty(d.sold)}</td>
                  <td className="px-4 py-3 tabnums text-red-600">{fmtQty(d.spoiled)}</td>
                  <td className="px-4 py-3 tabnums font-bold">{d.closing !== null ? `${fmtQty(d.closing)} ${d.unit}` : "—"}</td>
                </tr>
              ))}
            </TableShell>
          )}

          <div className="mt-8 mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-slate-900">سجل حركات المخزون</h2>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto" aria-label="تصفية نوع الحركة">
              <option value="">كل الحركات</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          {moves.length === 0 ? (
            <EmptyState title="لا توجد حركات" hint="كل شراء وبيع وهالك وتسوية تُسجل هنا تلقائياً مع الرصيد بعد الحركة." />
          ) : (
            <TableShell head={["الوقت", "الصنف", "النوع", "الكمية", "الرصيد بعدها", "ملاحظات"]}>
              {moves.map((m) => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 tabnums text-slate-500">{new Date(m.createdAt).toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 font-medium">{m.productName}</td>
                  <td className="px-4 py-3"><Badge tone={TYPE_LABEL[m.type]?.tone ?? "slate"}>{TYPE_LABEL[m.type]?.label ?? m.type}</Badge></td>
                  <td className="px-4 py-3 tabnums" dir="ltr">{Number(m.qty) > 0 ? `+${fmtQty(m.qty)}` : fmtQty(m.qty)}</td>
                  <td className="px-4 py-3 tabnums font-semibold">{fmtQty(m.balanceAfter)} {m.unit}</td>
                  <td className="px-4 py-3 text-slate-500">{m.notes ?? "—"}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </>
      )}

      <Modal open={!!action} onClose={() => setAction(null)} title={action?.type === "spoilage" ? `تسجيل هالك — ${action.product.name}` : `جرد فعلي — ${action?.product.name ?? ""}`}>
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">المخزون المسجل حالياً: <b>{fmtQty(action?.product.stockQty ?? 0)} {action?.product.unit}</b></p>
          <Field label={action?.type === "spoilage" ? `كمية الهالك (${action?.product.unit})` : `الكمية المعدودة فعلياً (${action?.product.unit})`} required>
            <Input type="number" min="0" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} className="ltr-nums" />
          </Field>
          {action?.type === "adjustment" && qty !== "" && (
            <p className={`text-sm font-semibold ${Number(qty) - Number(action.product.stockQty) === 0 ? "text-leaf-700" : "text-red-600"}`}>
              الفرق عن المسجل: {(Number(qty) - Number(action.product.stockQty)).toLocaleString("en-US")} {action.product.unit}
            </p>
          )}
          <Field label="سبب / ملاحظات">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={action?.type === "spoilage" ? "ذبول، انقطاع تبريد، انتهاء صلاحية اليوم…" : "جرد نهاية اليوم…"} />
          </Field>
          <div className="flex gap-2">
            <Btn onClick={submitAction} loading={saving} className="flex-1">{action?.type === "spoilage" ? "تسجيل الهالك" : "اعتماد الجرد"}</Btn>
            <Btn variant="secondary" onClick={() => setAction(null)}>إلغاء</Btn>
          </div>
        </div>
      </Modal>

      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <PackageSearch className="h-4 w-4" />
        تُحسب قيمة المخزون بمتوسط التكلفة المرجح المتحرك من أسعار الشراء الفعلية.
      </div>
    </div>
  );
}
