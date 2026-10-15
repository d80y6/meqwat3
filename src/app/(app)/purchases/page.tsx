"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronLeft, WifiOff, CloudUpload, RefreshCw, Undo2 } from "lucide-react";
import { apiCollection, apiPost, ClientError, newMutationId } from "@/lib/client";
import { enqueue, removeOp, getQueue, subscribeQueue, syncQueue, isOnline, type QueuedOp } from "@/lib/offline";
import { draftCents, draftLineTotal } from "@/lib/money-draft";
import { fmtMoney, fmtQty, toCents, fromCents } from "@/lib/money";
import { Btn, Field, Input, Select, Textarea, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Product { id: string; name: string; unit: string; costPrice: string; stockQty: string }
interface Supplier { id: string; name: string; balance: string }
interface PurchaseItem { id: string; productName: string; unit: string; qty: string; returnedQty: string; unitCost: string; total: string }
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
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  // purchase return
  const [returnFor, setReturnFor] = useState<Purchase | null>(null);
  const [returnLines, setReturnLines] = useState<{ purchaseItemId: string; qty: string }[]>([]);
  const [refundMethod, setRefundMethod] = useState<"cash" | "debt">("debt");
  const [returnSaving, setReturnSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr, s] = await Promise.all([
        apiCollection<Purchase>("/api/purchases?limit=50"),
        apiCollection<Product>("/api/products?active=1&limit=200"),
        apiCollection<Supplier>("/api/suppliers?limit=200"),
      ]);
      setItems(p.items);
      setProducts(pr.items);
      setSuppliers(s.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  useEffect(() => {
    const update = () => setQueue(getQueue().filter((q) => q.type === "purchase"));
    update();
    const unsub = subscribeQueue(update);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    queueMicrotask(() => setOnline(isOnline()));
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { unsub(); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const totalCents = useMemo(
    () => lines.reduce((sum, l) => sum + (l.productId ? toCents(draftLineTotal(l.qty, l.unitCost) ?? 0) : 0), 0),
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

  async function doSync() {
    setSyncing(true);
    try {
      const out = await syncQueue();
      if (out.applied + out.duplicates) toast.push("success", `تمت مزامنة ${out.applied + out.duplicates} فاتورة شراء`);
      if (out.conflicts.length) toast.push("error", `${out.conflicts.length} عملية متعارضة`);
      void load();
    } catch { toast.push("error", "تعذّرت المزامنة"); }
    finally { setSyncing(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!supplierId) return setError("اختر المورّد");
    const valid = lines.filter((l) => l.productId && Number(l.qty) > 0);
    if (valid.length === 0) return setError("أضف صنفاً واحداً على الأقل بكمية صحيحة");
    if (draftCents(paidAmount) === null || lines.some(l => l.productId && draftLineTotal(l.qty,l.unitCost) === null)) return setError("تحقق من المبالغ والكميات — المبالغ بخانتين عشريتين فقط");
    if ((draftCents(paidAmount) ?? 0) > totalCents) return setError("المبلغ المدفوع أكبر من إجمالي الشراء");
    const payload = {
      clientMutationId: newMutationId(),
      supplierId, paidAmount, notes: notes || undefined,
      items: valid.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.unitCost })),
    };
    const label = `فاتورة شراء — ${valid.length} صنف — ${fmtMoney(fromCents(totalCents))}`;
    try { enqueue("purchase", payload, label); } catch {
      return setError("تعذر حفظ العملية محلياً — لم يتم إرسالها");
    }
    setSaving(true);
    try {
      if (!isOnline()) throw new TypeError("offline");
      const res = await apiPost<{ id: string; totalAmount: string; liability: string }>("/api/purchases", payload);
      removeOp(payload.clientMutationId);
      toast.push("success", `تم تسجيل الشراء — الإجمالي ${fmtMoney(res.totalAmount)}${Number(res.liability) > 0 ? `، يُرحَّل للمورّد ${fmtMoney(res.liability)}` : ""}`);
      setModal(false);
      setLines([{ productId: "", qty: "1", unitCost: "" }]);
      setPaidAmount("0");
      setNotes("");
      void load();
    } catch (err) {
      if (err instanceof ClientError && err.status < 500) {
        removeOp(payload.clientMutationId);
        setError((err as ClientError).message);
      } else {
        // offline / network → queue idempotently; server deduplicates on clientMutationId
        enqueue("purchase", payload, label);
        const offline = err instanceof TypeError && (err as TypeError).message === "offline";
        toast.push("success", offline ? "لا يوجد اتصال — حُفظت فاتورة الشراء محلياً وستُزامَن تلقائياً" : "تعذّر الاتصال — حُفظت فاتورة الشراء محلياً وستُزامَن لاحقاً");
        setModal(false);
        setLines([{ productId: "", qty: "1", unitCost: "" }]);
        setPaidAmount("0"); setNotes("");
      }
    } finally { setSaving(false); }
  }

  async function submitReturn() {
    if (!returnFor) return;
    const valid = returnLines.filter((r) => Number(r.qty) > 0);
    if (valid.length === 0) return toast.push("error", "اختر بنوداً وكميات للإرجاع");
    setReturnSaving(true);
    try {
      const res = await apiPost<{ refundAmount: string }>(`/api/purchases/${returnFor.id}/return`, { items: valid, refundMethod });
      toast.push("success", `تم إرجاع المشتريات — المبلغ المرتجع ${fmtMoney(res.refundAmount)}`);
      setReturnFor(null); setReturnLines([]);
      void load();
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "تعذر إرجاع المشتريات"); }
    finally { setReturnSaving(false); }
  }

  return (
    <div>
      <PageHeader title="المشتريات" subtitle="شراء القات من المزارعين والوكلاء — يزيد المخزون والمستحقات" actions={
        <>
          {!online && <Badge tone="amber"><WifiOff className="h-3.5 w-3.5" /> دون اتصال</Badge>}
          {queue.length > 0 && <Btn variant="amber" onClick={doSync} loading={syncing}><CloudUpload className="h-4 w-4" /> مزامنة ({queue.length})</Btn>}
          <Btn onClick={() => setModal(true)}><Plus className="h-4 w-4" /> فاتورة شراء</Btn>
        </>
      } />
      {queue.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 font-bold text-amber-900"><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> فواتير شراء معلّقة محلياً ({queue.length}) — ستُزامَن تلقائياً عند عودة الاتصال</div>
          <ul className="mt-2 space-y-1 text-xs text-amber-800">{queue.map((q) => <li key={q.clientMutationId}>• {q.label}</li>)}</ul>
        </div>
      )}
      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا توجد مشتريات بعد" hint="سجّل أول فاتورة شراء وسيُحدَّث المخزون ومستحقات المورّد تلقائياً." action={<Btn onClick={() => setModal(true)}><Plus className="h-4 w-4" /> فاتورة شراء جديدة</Btn>} />
      ) : (
        <TableShell head={["التاريخ", "المورّد", "الإجمالي", "المدفوع", "المتبقي", "الأصناف", ""]}>
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
                <td className="px-4 py-3">
                  <button onClick={() => { setReturnFor(p); setReturnLines(p.items.map((it) => ({ purchaseItemId: it.id, qty: "0" }))); }} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold hover:bg-slate-200">
                    <Undo2 className="h-3.5 w-3.5" /> إرجاع
                  </button>
                </td>
              </tr>
              {expanded === p.id && (
                <tr key={`${p.id}-items`} className="bg-slate-50/60">
                  <td colSpan={7} className="px-6 py-3">
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
                <div className="col-span-1 text-sm font-bold tabnums">{l.productId ? draftLineTotal(l.qty, l.unitCost) === null ? "غير صالح" : fmtMoney(draftLineTotal(l.qty, l.unitCost)) : "—"}</div>
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
              <div className="flex justify-between text-red-600"><span>يُرحَّل كمستحق للمورّد</span><b className="tabnums">{fmtMoney(fromCents(Math.max(0, totalCents - (draftCents(paidAmount) ?? 0))))}</b></div>
            </div>
          </div>
          <Field label="ملاحظات"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="رقم سيارة النقل، جودة المحصول…" /></Field>
          <div className="flex gap-2"><Btn type="submit" loading={saving} className="flex-1">حفظ فاتورة الشراء</Btn><Btn type="button" variant="secondary" onClick={() => setModal(false)}>إلغاء</Btn></div>
          {!online && <p className="text-center text-xs font-semibold text-amber-700">أنت دون اتصال — ستُحفظ الفاتورة محلياً مع معرّف ثابت يمنع التكرار عند المزامنة.</p>}
        </form>
      </Modal>

      <Modal open={!!returnFor} onClose={() => setReturnFor(null)} title={returnFor ? `إرجاع مشتريات — ${returnFor.supplierName}` : "إرجاع مشتريات"}>
        {returnFor && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">اختر الكميات المراد إرجاعها — يُنقص المخزون وتُخفَّض مستحقات المورّد أو يُرد نقداً.</p>
            {returnFor.items.map((it, idx) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <span className="flex-1 text-sm font-semibold">{it.productName} — متاح {fmtQty(it.qty)} × {fmtMoney(it.unitCost)}</span>
                <Input type="number" min="0" max={Number(it.qty) - Number(it.returnedQty ?? 0)} step="0.5" value={returnLines[idx]?.qty ?? "0"} onChange={(e) => setReturnLines((ls) => ls.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))} className="w-24 ltr-nums" aria-label={`كمية إرجاع ${it.productName}`} />
              </div>
            ))}
            <Field label="طريقة الاسترداد">
              <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as "cash" | "debt")}>
                <option value="debt">خفض مستحقات المورّد</option>
                <option value="cash">استرداد نقدي (يسجّل حركة مالية)</option>
              </Select>
            </Field>
            <Btn onClick={submitReturn} loading={returnSaving} className="w-full"><Undo2 className="h-4 w-4" /> تأكيد إرجاع المشتريات</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
}
