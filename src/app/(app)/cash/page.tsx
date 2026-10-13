"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Lock, Landmark, TriangleAlert, Receipt, Wallet } from "lucide-react";
import { apiGet, apiPost, newMutationId } from "@/lib/client";
import { fmtMoney } from "@/lib/money";
import { Btn, Field, Input, Select, Textarea, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Register { id: string; name: string }
interface Shift {
  id: string; registerName: string; userName: string; status: string; openingCash: string;
  countedCash: string | null; expectedCash: string | null; expectedNow: string | null;
  difference: string | null; openedAt: string; closedAt: string | null;
}
interface Expense { id: string; amount: string; description: string; category: string | null; shiftId: string | null; createdAt: string }

export default function CashPage() {
  const toast = useToast();
  const [registers, setRegisters] = useState<Register[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expShift, setExpShift] = useState<string>("");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expCategory, setExpCategory] = useState("عام");
  const [expSaving, setExpSaving] = useState(false);
  const [closeFor, setCloseFor] = useState<Shift | null>(null);
  const [registerId, setRegisterId] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [counted, setCounted] = useState("");
  const [newRegister, setNewRegister] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s, ex] = await Promise.all([
        apiGet<{ registers: Register[] }>("/api/registers"),
        apiGet<{ items: Shift[] }>("/api/shifts?limit=30"),
        apiGet<{ items: Expense[] }>("/api/expenses?limit=30").catch(() => ({ items: [] as Expense[] })),
      ]);
      setRegisters(r.registers);
      setShifts(s.items);
      setExpenses(ex.items);
      if (r.registers.length) setRegisterId((cur) => cur || r.registers[0].id);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  async function openShift() {
    if (!registerId) return toast.push("error", "اختر الصندوق أو أنشئ صندوقاً أولاً");
    setSaving(true);
    try {
      await apiPost("/api/shifts", { registerId, openingCash });
      toast.push("success", "تم فتح الوردية");
      setOpenModal(false);
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر فتح الوردية"); }
    finally { setSaving(false); }
  }

  async function closeShift() {
    if (!closeFor) return;
    if (counted === "") return toast.push("error", "أدخل النقد المعدود فعلياً في الدرج");
    setSaving(true);
    try {
      const closed = await apiPost<Shift>(`/api/shifts/${closeFor.id}/close`, { countedCash: counted });
      const diff = Number(closed.difference ?? 0);
      toast.push(diff === 0 ? "success" : "error",
        diff === 0 ? "أُغلقت الوردية — النقد متطابق تماماً" : `أُغلقت الوردية مع فرق ${fmtMoney(Math.abs(diff))} ${diff < 0 ? "(عجز)" : "(زيادة)"}`);
      setCloseFor(null);
      setCounted("");
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر إغلاق الوردية"); }
    finally { setSaving(false); }
  }

  async function addRegister() {
    if (!newRegister.trim()) return toast.push("error", "أدخل اسم الصندوق");
    try {
      const reg = await apiPost<Register>("/api/registers", { name: newRegister });
      setRegisters((r) => [...r, reg]);
      setRegisterId(reg.id);
      setNewRegister("");
      toast.push("success", "تم إنشاء الصندوق");
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر إنشاء الصندوق"); }
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expAmount || !expDesc.trim()) return toast.push("error", "أدخل المبلغ والوصف");
    if (Number(expAmount) <= 0) return toast.push("error", "المبلغ يجب أن يكون أكبر من صفر");
    setExpSaving(true);
    try {
      await apiPost("/api/expenses", { amount: expAmount, description: expDesc, category: expCategory, shiftId: expShift || null, clientMutationId: newMutationId() });
      toast.push("success", "تم تسجيل المصروف");
      setExpenseModal(false); setExpAmount(""); setExpDesc("");
      void load();
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "تعذر تسجيل المصروف"); }
    finally { setExpSaving(false); }
  }

  const openShifts = shifts.filter((s) => s.status === "open");

  return (
    <div>
      <PageHeader
        title="الصناديق والورديات"
        subtitle="فتح وإغلاق الورديات ومطابقة النقد المتوقع مقابل المعدود — مع دفتر المصروفات"
        actions={<><Btn variant="secondary" onClick={() => setExpenseModal(true)}><Receipt className="h-4 w-4" /> مصروف</Btn><Btn onClick={() => setOpenModal(true)}><Plus className="h-4 w-4" /> فتح وردية</Btn></>}
      />

      <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Landmark className="h-5 w-5 text-leaf-700" /> صناديق المتجر ({registers.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          {registers.map((r) => {
            const open = openShifts.find((s) => s.registerName === r.name);
            return (
              <span key={r.id} className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200">
                {r.name}
                {open ? <Badge tone="green">وردية مفتوحة</Badge> : <Badge tone="slate">مغلق</Badge>}
              </span>
            );
          })}
          <div className="flex items-center gap-2">
            <Input value={newRegister} onChange={(e) => setNewRegister(e.target.value)} placeholder="اسم صندوق جديد" className="w-44" aria-label="اسم صندوق جديد" />
            <Btn variant="secondary" onClick={addRegister} className="px-3 py-2 text-xs"><Plus className="h-3.5 w-3.5" /> إضافة صندوق</Btn>
          </div>
        </div>
      </div>

      {/* المصروفات */}
      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold"><Receipt className="h-5 w-5 text-amber-600" /> المصروفات اليومية ({expenses.length})</h2>
          <Btn variant="secondary" onClick={() => setExpenseModal(true)} className="px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> تسجيل مصروف</Btn>
        </div>
        {expenses.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">لا توجد مصروفات مسجلة — تُخصم المصروفات من مطابقة الوردية وتظهر في تقارير الأرباح.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {expenses.slice(0, 8).map((ex) => (
              <li key={ex.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-semibold">{ex.description}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{ex.category ?? "عام"}</span>
                <span className="ms-auto font-bold tabnums text-red-600">-{fmtMoney(ex.amount)}</span>
                <span className="text-xs text-slate-400">{new Date(ex.createdAt).toLocaleDateString("ar-YE")}</span>
              </li>
            ))}
          </ul>
        )}
        {expenses.length > 0 && (
          <p className="mt-2 text-xs text-slate-400 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> إجمالي المصروفات المعروضة: {fmtMoney(String(expenses.slice(0, 8).reduce((s, e) => s + Number(e.amount), 0)))} — المصروفات تؤثر على صافي الربح المتاح في لوحة التقارير.</p>
        )}
      </div>

      {loading ? <Loading /> : shifts.length === 0 ? (
        <EmptyState title="لا توجد ورديات بعد" hint="افتح أول وردية لبدء البيع مع تتبع النقد والمطابقة عند الإغلاق." action={<Btn onClick={() => setOpenModal(true)}><Plus className="h-4 w-4" /> فتح وردية</Btn>} />
      ) : (
        <TableShell head={["الصندوق", "الكاشير", "الافتتاحي", "المتوقع الآن/عند الإغلاق", "المعدود", "الفرق", "الحالة", ""]}>
          {shifts.map((s) => {
            const expected = s.status === "open" ? s.expectedNow : s.expectedCash;
            const diff = Number(s.difference ?? 0);
            return (
              <tr key={s.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-semibold">{s.registerName}</td>
                <td className="px-4 py-3">
                  {s.userName}
                  <p className="text-xs text-slate-400">{new Date(s.openedAt).toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" })}{s.closedAt ? ` ← ${new Date(s.closedAt).toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" })}` : ""}</p>
                </td>
                <td className="px-4 py-3 tabnums">{fmtMoney(s.openingCash)}</td>
                <td className="px-4 py-3 tabnums font-semibold">{expected ? fmtMoney(expected) : "—"}</td>
                <td className="px-4 py-3 tabnums">{s.countedCash ? fmtMoney(s.countedCash) : "—"}</td>
                <td className="px-4 py-3">
                  {s.status === "closed" ? (
                    diff === 0 ? <Badge tone="green">متطابق</Badge> : <Badge tone="red">{diff < 0 ? "عجز" : "زيادة"} {fmtMoney(Math.abs(diff))}</Badge>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">{s.status === "open" ? <Badge tone="green">مفتوحة</Badge> : <Badge tone="slate">مغلقة</Badge>}</td>
                <td className="px-4 py-3">
                  {s.status === "open" && (
                    <button onClick={() => { setCloseFor(s); setCounted(s.expectedNow ?? ""); }} className="inline-flex items-center gap-1 rounded-lg bg-leaf-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-leaf-800">
                      <Lock className="h-3.5 w-3.5" /> إغلاق ومطابقة
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </TableShell>
      )}

      <Modal open={openModal} onClose={() => setOpenModal(false)} title="فتح وردية جديدة">
        <div className="space-y-4">
          <Field label="الصندوق" required>
            <select value={registerId} onChange={(e) => setRegisterId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-100" aria-label="الصندوق">
              {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="النقد الافتتاحي في الدرج (ر.ي)">
            <Input type="number" min="0" step="any" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="ltr-nums" />
          </Field>
          <Btn onClick={openShift} loading={saving} className="w-full">فتح الوردية</Btn>
        </div>
      </Modal>

      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="تسجيل مصروف جديد">
        <form onSubmit={addExpense} className="space-y-4" noValidate>
          <Field label="الوصف" required><Input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="نقل، إيجار، ضيافة…" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المبلغ (ر.ي)" required><Input type="number" min="0" step="any" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="ltr-nums" /></Field>
            <Field label="التصنيف"><Select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
              <option value="عام">عام</option><option value="نقل">نقل</option><option value="إيجار">إيجار</option><option value="ضيافة">ضيافة</option><option value="رواتب">رواتب</option><option value="صيانة">صيانة</option><option value="أخرى">أخرى</option>
            </Select></Field>
          </div>
          <Field label="الوردية (اختياري — يربط المصروف بالوردية الحالية)">
            <Select value={expShift} onChange={(e) => setExpShift(e.target.value)}>
              <option value="">بدون ربط بوردية</option>
              {shifts.filter((s) => s.status === "open").map((s) => <option key={s.id} value={s.id}>{s.registerName} — {s.userName}</option>)}
            </Select>
          </Field>
          <Btn type="submit" loading={expSaving} className="w-full"><Receipt className="h-4 w-4" /> حفظ المصروف</Btn>
          <p className="text-xs leading-5 text-slate-400">المصروف يُسجَّل كحركة مالية وتُخصم من صافي الربح ومتوقع النقد عند إغلاق الوردية.</p>
        </form>
      </Modal>

      <Modal open={!!closeFor} onClose={() => setCloseFor(null)} title={`إغلاق الوردية — ${closeFor?.registerName ?? ""}`}>
        {closeFor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">النقد الافتتاحي</p><p className="font-bold tabnums">{fmtMoney(closeFor.openingCash)}</p></div>
              <div className="rounded-xl bg-leaf-50 p-3"><p className="text-xs text-slate-500">النقد المتوقع (افتتاحي + حركات الوردية)</p><p className="font-bold tabnums">{closeFor.expectedNow ? fmtMoney(closeFor.expectedNow) : "—"}</p></div>
            </div>
            <Field label="النقد المعدود فعلياً في الدرج (ر.ي)" required>
              <Input type="number" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} className="ltr-nums" autoFocus />
            </Field>
            {counted !== "" && closeFor.expectedNow && (
              <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${Number(counted) - Number(closeFor.expectedNow) === 0 ? "bg-leaf-50 text-leaf-800" : "bg-red-50 text-red-700"}`}>
                <TriangleAlert className="h-4 w-4" />
                {Number(counted) - Number(closeFor.expectedNow) === 0
                  ? "متطابق مع المتوقع"
                  : `الفرق: ${fmtMoney(Math.abs(Number(counted) - Number(closeFor.expectedNow)))} ${Number(counted) < Number(closeFor.expectedNow) ? "(عجز)" : "(زيادة)"}`}
              </p>
            )}
            <Btn onClick={closeShift} loading={saving} className="w-full">تأكيد الإغلاق والمطابقة</Btn>
            <p className="text-xs leading-5 text-slate-400">عند الإغلاق تُختم الوردية ولا يمكن تعديلها، ويُسجل الفرق في سجل التدقيق.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
