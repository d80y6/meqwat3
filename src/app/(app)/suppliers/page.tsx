"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, HandCoins, Eye } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/client";
import { fmtMoney } from "@/lib/money";
import { Btn, Field, Input, Textarea, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Supplier { id: string; name: string; phone: string | null; address: string | null; balance: string; notes: string | null }
interface Detail { supplier: Supplier; recentPurchases: { id: string; totalAmount: string; paidAmount: string; purchaseDate: string }[]; recentPayments: { id: string; amount: string; createdAt: string }[] }

const empty = { name: "", phone: "", address: "", notes: "" };

export default function SuppliersPage() {
  const toast = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payFor, setPayFor] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: Supplier[] }>(`/api/suppliers?limit=200&search=${encodeURIComponent(search)}${onlyDebt ? "&debt=1" : ""}`);
      setItems(d.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [search, onlyDebt, toast]);
  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("اسم المورّد مطلوب");
    setSaving(true);
    try {
      if (editing) {
        const u = await apiPatch<Supplier>(`/api/suppliers/${editing.id}`, form);
        setItems((p) => p.map((x) => (x.id === u.id ? u : x)));
        toast.push("success", "تم تحديث المورّد");
      } else {
        const c = await apiPost<Supplier>("/api/suppliers", form);
        setItems((p) => [c, ...p]);
        toast.push("success", "تمت إضافة المورّد");
      }
      setModal(false);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); void load(); }
    finally { setSaving(false); }
  }

  async function paySupplier() {
    if (!payFor) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.push("error", "أدخل مبلغاً صحيحاً");
    if (amount > Number(payFor.balance)) return toast.push("error", "المبلغ أكبر من المستحق للمورّد");
    try {
      const res = await apiPost<{ newBalance: string }>("/api/payments", { kind: "supplier_payment", supplierId: payFor.id, amount: payAmount });
      setItems((p) => p.map((x) => (x.id === payFor.id ? { ...x, balance: res.newBalance } : x)));
      toast.push("success", `تم سداد ${fmtMoney(payAmount)} — المتبقي ${fmtMoney(res.newBalance)}`);
      setPayFor(null);
      setPayAmount("");
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر السداد"); }
  }

  async function showDetail(s: Supplier) {
    try { setDetail(await apiGet<Detail>(`/api/suppliers/${s.id}`)); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
  }

  return (
    <div>
      <PageHeader title="المورّدون والوكالات" subtitle="مزارعو ووكلاء القات ومستحقاتهم (شامل بضاعة بالأمانة)" actions={<Btn onClick={() => { setEditing(null); setForm(empty); setError(""); setModal(true); }}><Plus className="h-4 w-4" /> مورّد جديد</Btn>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم…" className="pr-10" aria-label="بحث المورّدين" />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} className="h-4 w-4 accent-leaf-700" />
          لهم مستحقات فقط
        </label>
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا يوجد مورّدون" hint="أضف المزارعين والوكلاء الذين تشتري منهم القات لتتبع المشتريات والمستحقات." />
      ) : (
        <TableShell head={["المورّد", "الهاتف", "المستحق له", "إجراءات"]}>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="px-4 py-3"><p className="font-semibold">{s.name}</p>{s.address && <p className="text-xs text-slate-400">{s.address}</p>}</td>
              <td className="px-4 py-3 tabnums" dir="ltr">{s.phone ?? "—"}</td>
              <td className="px-4 py-3">{Number(s.balance) > 0 ? <Badge tone="red">{fmtMoney(s.balance)}</Badge> : <span className="text-slate-400">خالص</span>}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => showDetail(s)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="كشف الحساب"><Eye className="h-4 w-4" /></button>
                  <button onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone ?? "", address: s.address ?? "", notes: s.notes ?? "" }); setError(""); setModal(true); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                  {Number(s.balance) > 0 && (
                    <button onClick={() => { setPayFor(s); setPayAmount(s.balance); }} className="inline-flex items-center gap-1 rounded-lg bg-leaf-50 px-2 py-1.5 text-xs font-bold text-leaf-800 hover:bg-leaf-100"><HandCoins className="h-4 w-4" /> سداد</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "تعديل مورّد" : "مورّد جديد"}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
          <Field label="اسم المورّد" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="الهاتف"><Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="العنوان"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex gap-2"><Btn type="submit" loading={saving} className="flex-1">حفظ</Btn><Btn type="button" variant="secondary" onClick={() => setModal(false)}>إلغاء</Btn></div>
        </form>
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`سداد للمورّد — ${payFor?.name ?? ""}`}>
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">المستحق الحالي: <b>{fmtMoney(payFor?.balance ?? 0)}</b></p>
          <Field label="مبلغ السداد (ر.ي)" required>
            <Input type="number" min="0" step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="ltr-nums" />
          </Field>
          <div className="flex gap-2">
            <Btn onClick={() => setPayAmount(payFor?.balance ?? "")} variant="secondary">كامل المبلغ</Btn>
            <Btn onClick={paySupplier} className="flex-1">تأكيد السداد</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`كشف حساب — ${detail?.supplier.name ?? ""}`} wide>
        {detail && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-xs text-slate-500">إجمالي المستحق للمورّد</p><p className="text-lg font-bold tabnums">{fmtMoney(detail.supplier.balance)}</p></div>
            <div>
              <h4 className="mb-2 font-bold">آخر المشتريات</h4>
              {detail.recentPurchases.length === 0 ? <p className="text-sm text-slate-400">لا توجد مشتريات</p> : (
                <ul className="divide-y divide-slate-50 text-sm">
                  {detail.recentPurchases.map((p) => (
                    <li key={p.id} className="flex justify-between py-2">
                      <span>{new Date(p.purchaseDate).toLocaleDateString("ar-YE")}</span>
                      <span className="tabnums">الإجمالي {fmtMoney(p.totalAmount)} · مدفوع {fmtMoney(p.paidAmount)} · متبقٍ {fmtMoney(Number(p.totalAmount) - Number(p.paidAmount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 font-bold">آخر السدادات</h4>
              {detail.recentPayments.length === 0 ? <p className="text-sm text-slate-400">لا توجد سدادات</p> : (
                <ul className="divide-y divide-slate-50 text-sm">
                  {detail.recentPayments.map((p) => (
                    <li key={p.id} className="flex justify-between py-2">
                      <span>{new Date(p.createdAt).toLocaleDateString("ar-YE")}</span>
                      <span className="tabnums text-leaf-700">{fmtMoney(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
