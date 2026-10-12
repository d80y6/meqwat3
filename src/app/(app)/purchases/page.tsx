"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronLeft } from "lucide-react";
import { apiGet, apiPost } from "@/lib/client";
import { fmtMoney, fmtQty, mulQtyPrice, toCents, fromCents } from "@/lib/money";
import { Btn, Field, Input, Select, Textarea, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Product { id: string; name: string; unit: string; costPrice: string; stockQty: string }
interface Supplier { id: string; name: string; balance: string }
interface PurchaseItem { id: string; productName: string; unit: string; qty: string; unitCost: string; total: string }
interface Purchase { id: string; supplierName: string; totalAmount: string; paidAmount: string; remaining: string; purchaseDate: string; notes: string | null; items: PurchaseItem[] }

interface Line { productId: string; qty: string; unitCost: string }

export default function PurchasesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", qty: "1", unitCost: "" }]);
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr, s] = await Promise.all([
        apiGet<{ items: Purchase[] }>("/api/purchases?limit=50"),
        apiGet<{ items: Product[] }>("/api/products?active=1&limit=200"),
        apiGet<{ items: Supplier[] }>("/api/suppliers?limit=200"),
      ]);
      setItems(p.items);
      setProducts(pr.items);
      setSuppliers(s.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const totalCents = useMemo(
    () => lines.reduce((sum, l) => sum + (l.productId ? toCents(mulQtyPrice(l.qty || 0, l.unitCost || 0)) : 0), 0),
    [lines],
  );

  function addLine() { setLines((l) => [...l, { productId: "", qty: "1", unitCost: "" }]); }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, ...patch };
      if (patch.productId) {
        const p = products.find((x) => x.id === patch.productId);
        if (p && !patch.unitCost) next.unitCost = p.costPrice;
      }
      return next;
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!supplierId) return setError("اختر المورّد");
    const valid = lines.filter((l) => l.productId && Number(l.qty) > 0);
    if (valid.length === 0) return setError("أضف صنفاً واحداً على الأقل بكمية صحيحة");
    if (Number(paidAmount) > totalCents / 100) return setError("المبلغ المدفوع أكبر من إجمالي الشراء");
    setSaving(true);
    try {
      const res = await apiPost<{ id: string; totalAmount: string; liability: string }>("/api/purchases", {
        supplierId, paidAmount, notes: notes || undefined,
        items: valid.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.unitCost })),
      });
      toast.push("success", `تم تسجيل الشراء — الإجمالي ${fmtMoney(res.totalAmount)}${Number(res.liability) > 0 ? `، يُرحَّل للمورّد ${fmtMoney(res.liability)}` : ""}`);
      setModal(false);
      setLines([{ productId: "", qty: "1", unitCost: "" }]);
      setPaidAmount("0");
      setNotes("");
      void load();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="المشتريات" subtitle="شراء القات من المزارعين والوكلاء — يزيد المخزون والمستحقات" actions={<Btn onClick={() => setModal(true)}><Plus className="h-4 w-4" /> فاتورة شراء</Btn>} />
      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا توجد مشتريات بعد" hint="سجّل أول فاتورة شراء وسيُحدَّث المخزون ومستحقات المورّد تلقائياً." action={<Btn onClick={() => setModal(true)}><Plus className="h-4 w-4" /> فاتورة شراء جديدة</Btn>} />
      ) : (
        <TableShell head={["التاريخ", "المورّد", "الإجمالي", "المدفوع", "المتبقي", "الأصناف"]}>
          {items.map((p) => (
            <Fragment key={p.id}>
              <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-4 py-3 tabnums">{new Date(p.purchaseDate).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-4 py-3 font-semibold">{p.supplierName}</td>
                <td className="px-4 py-3 tabnums">{fmtMoney(p.totalAmount)}</td>
                <td className="px-4 py-3 tabnums text-leaf-700">{fmtMoney(p.paidAmount)}</td>
                <td className="px-4 py-3">{Number(p.remaining) > 0 ? <Badge tone="red">{fmtMoney(p.remaining)}</Badge> : <span className="text-slate-400">خالص</span>}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-leaf-700 hover:underline">
                    {p.items.length} صنف {expanded === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
              {expanded === p.id && (
                <tr key={`${p.id}-items`} className="bg-slate-50/60">
                  <td colSpan={6} className="px-6 py-3">
                    <ul className="space-y-1 text-sm">
                      {p.items.map((it) => (
                        <li key={it.id} className="flex justify-between">
                          <span>{it.productName} — {fmtQty(it.qty)} {it.unit} × {fmtMoney(it.unitCost)}</span>
                          <span className="tabnums font-semibold">{fmtMoney(it.total)}</span>
                        </li>
                      ))}
                    </ul>
                    {p.notes && <p className="mt-2 text-xs text-slate-500">{p.notes}</p>}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </TableShell>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="فاتورة شراء جديدة" wide>
        <form onSubmit={save} className="space-y-4" noValidate>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
          <Field label="المورّد" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— اختر المورّد —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{Number(s.balance) > 0 ? ` (مستحق ${fmtMoney(s.balance)})` : ""}</option>)}
            </Select>
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">الأصناف المشتراة</p>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-5">
                  <Select value={l.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} aria-label="الصنف">
                    <option value="">— اختر الصنف —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} (متاح {fmtQty(p.stockQty)})</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input type="number" min="0" step="0.5" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="ltr-nums" aria-label="الكمية" placeholder="الكمية" />
                </div>
                <div className="col-span-3">
                  <Input type="number" min="0" step="any" value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} className="ltr-nums" aria-label="سعر الشراء" placeholder="سعر الشراء" />
                </div>
                <div className="col-span-1 text-sm font-bold tabnums">{l.productId ? fmtMoney(mulQtyPrice(l.qty || 0, l.unitCost || 0)) : "—"}</div>
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="col-span-1 rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="حذف البند"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Btn type="button" variant="secondary" onClick={addLine} className="text-xs"><Plus className="h-3.5 w-3.5" /> إضافة بند</Btn>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المدفوع للمورّد الآن (ر.ي)">
              <Input type="number" min="0" step="any" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="ltr-nums" />
            </Field>
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span>إجمالي الشراء</span><b className="tabnums">{fmtMoney(fromCents(totalCents))}</b></div>
              <div className="flex justify-between text-red-600"><span>يُرحَّل كمستحق للمورّد</span><b className="tabnums">{fmtMoney(fromCents(Math.max(0, totalCents - toCents(paidAmount || 0))))}</b></div>
            </div>
          </div>
          <Field label="ملاحظات"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="رقم سيارة النقل، جودة المحصول…" /></Field>
          <div className="flex gap-2"><Btn type="submit" loading={saving} className="flex-1">حفظ فاتورة الشراء</Btn><Btn type="button" variant="secondary" onClick={() => setModal(false)}>إلغاء</Btn></div>
        </form>
      </Modal>
    </div>
  );
}
