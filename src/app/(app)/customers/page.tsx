"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, HandCoins, Eye } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/client";
import { fmtMoney } from "@/lib/money";
import { Btn, Field, Input, Textarea, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Customer { id: string; name: string; phone: string | null; address: string | null; creditLimit: string; balance: string; notes: string | null }
interface Detail { customer: Customer; recentSales: { id: string; invoiceNo: number; totalAmount: string; creditAmount: string; saleDate: string; status: string }[]; recentPayments: { id: string; amount: string; kind: string; createdAt: string }[] }

const empty = { name: "", phone: "", address: "", creditLimit: "", notes: "" };

export default function CustomersPage() {
  const toast = useToast();
  const [items, setItems] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: Customer[] }>(`/api/customers?limit=200&search=${encodeURIComponent(search)}${onlyDebt ? "&debt=1" : ""}`);
      setItems(d.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [search, onlyDebt, toast]);
  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("اسم العميل مطلوب");
    setSaving(true);
    try {
      if (editing) {
        const u = await apiPatch<Customer>(`/api/customers/${editing.id}`, form);
        setItems((p) => p.map((x) => (x.id === u.id ? u : x)));
        toast.push("success", "تم تحديث العميل");
      } else {
        const c = await apiPost<Customer>("/api/customers", form);
        setItems((p) => [c, ...p]);
        toast.push("success", "تمت إضافة العميل");
      }
      setModal(false);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); void load(); }
    finally { setSaving(false); }
  }

  async function collectPayment() {
    if (!payFor) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.push("error", "أدخل مبلغاً صحيحاً");
    if (amount > Number(payFor.balance)) return toast.push("error", "المبلغ أكبر من دين العميل");
    try {
      const res = await apiPost<{ newBalance: string }>("/api/payments", { kind: "customer_payment", customerId: payFor.id, amount: payAmount });
      setItems((p) => p.map((x) => (x.id === payFor.id ? { ...x, balance: res.newBalance } : x)));
      toast.push("success", `تم تحصيل ${fmtMoney(payAmount)} — الرصيد المتبقي ${fmtMoney(res.newBalance)}`);
      setPayFor(null);
      setPayAmount("");
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحصيل"); }
  }

  async function showDetail(c: Customer) {
    try { setDetail(await apiGet<Detail>(`/api/customers/${c.id}`)); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
  }

  return (
    <div>
      <PageHeader title="العملاء" subtitle="حسابات العملاء وديون الآجل وحدود الائتمان" actions={<Btn onClick={() => { setEditing(null); setForm(empty); setError(""); setModal(true); }}><Plus className="h-4 w-4" /> عميل جديد</Btn>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم…" className="pr-10" aria-label="بحث العملاء" />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} className="h-4 w-4 accent-leaf-700" />
          أصحاب الديون فقط
        </label>
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا يوجد عملاء" hint={onlyDebt ? "لا توجد ديون مستحقة حالياً — ممتاز!" : "أضف عملاءك المنتظمين لتفعيل البيع بالآجل وتتبع الديون."} />
      ) : (
        <TableShell head={["العميل", "الهاتف", "حد الائتمان", "الرصيد المستحق", "إجراءات"]}>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="px-4 py-3"><p className="font-semibold">{c.name}</p>{c.address && <p className="text-xs text-slate-400">{c.address}</p>}</td>
              <td className="px-4 py-3 tabnums" dir="ltr">{c.phone ?? "—"}</td>
              <td className="px-4 py-3 tabnums">{Number(c.creditLimit) > 0 ? fmtMoney(c.creditLimit) : "بدون حد"}</td>
              <td className="px-4 py-3">{Number(c.balance) > 0 ? <Badge tone="amber">{fmtMoney(c.balance)}</Badge> : <span className="text-slate-400">خالص</span>}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => showDetail(c)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="عرض كشف الحساب"><Eye className="h-4 w-4" /></button>
                  <button onClick={() => { setEditing(c); setForm({ name: c.name, phone: c.phone ?? "", address: c.address ?? "", creditLimit: c.creditLimit, notes: c.notes ?? "" }); setError(""); setModal(true); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                  {Number(c.balance) > 0 && (
                    <button onClick={() => { setPayFor(c); setPayAmount(c.balance); }} className="inline-flex items-center gap-1 rounded-lg bg-leaf-50 px-2 py-1.5 text-xs font-bold text-leaf-800 hover:bg-leaf-100"><HandCoins className="h-4 w-4" /> تحصيل</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "تعديل عميل" : "عميل جديد"}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
          <Field label="اسم العميل" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الهاتف"><Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="حد الائتمان (ر.ي)"><Input type="number" min="0" step="any" className="ltr-nums" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="0 = بدون حد" /></Field>
          </div>
          <Field label="العنوان"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex gap-2"><Btn type="submit" loading={saving} className="flex-1">حفظ</Btn><Btn type="button" variant="secondary" onClick={() => setModal(false)}>إلغاء</Btn></div>
        </form>
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`تحصيل سداد — ${payFor?.name ?? ""}`}>
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">الدين الحالي: <b>{fmtMoney(payFor?.balance ?? 0)}</b></p>
          <Field label="مبلغ التحصيل (ر.ي)" required>
            <Input type="number" min="0" step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="ltr-nums" />
          </Field>
          <div className="flex gap-2">
            <Btn onClick={() => setPayAmount(payFor?.balance ?? "")} variant="secondary">كامل المبلغ</Btn>
            <Btn onClick={collectPayment} className="flex-1">تأكيد التحصيل</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`كشف حساب — ${detail?.customer.name ?? ""}`} wide>
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الرصيد المستحق</p><p className="font-bold tabnums">{fmtMoney(detail.customer.balance)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">حد الائتمان</p><p className="font-bold tabnums">{Number(detail.customer.creditLimit) > 0 ? fmtMoney(detail.customer.creditLimit) : "بدون حد"}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الهاتف</p><p className="font-bold tabnums" dir="ltr">{detail.customer.phone ?? "—"}</p></div>
            </div>
            <div>
              <h4 className="mb-2 font-bold">آخر الفواتير</h4>
              {detail.recentSales.length === 0 ? <p className="text-sm text-slate-400">لا توجد فواتير</p> : (
                <ul className="divide-y divide-slate-50 text-sm">
                  {detail.recentSales.map((s) => (
                    <li key={s.id} className="flex justify-between py-2">
                      <span>فاتورة #{s.invoiceNo} — {new Date(s.saleDate).toLocaleDateString("ar-YE")}</span>
                      <span className="tabnums">{fmtMoney(s.totalAmount)}{Number(s.creditAmount) > 0 ? ` (آجل ${fmtMoney(s.creditAmount)})` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 font-bold">آخر التحصيلات</h4>
              {detail.recentPayments.length === 0 ? <p className="text-sm text-slate-400">لا توجد تحصيلات</p> : (
                <ul className="divide-y divide-slate-50 text-sm">
                  {detail.recentPayments.map((p) => (
                    <li key={p.id} className="flex justify-between py-2">
                      <span>{p.kind === "customer_payment" ? "تحصيل دين" : "دفعة فاتورة"} — {new Date(p.createdAt).toLocaleDateString("ar-YE")}</span>
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
