"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Btn, Field, Input, Select, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface UserRow { id: string; name: string; email: string; phone: string | null; role: Role; isActive: boolean; lastLoginAt: string | null }

const empty = { name: "", email: "", phone: "", password: "", role: "cashier" as Role };

export default function UsersPage() {
  const toast = useToast();
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: UserRow[] }>("/api/users");
      setItems(d.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("الاسم مطلوب");
    if (!editing && (!form.email.includes("@") || form.password.length < 8)) return setError("أدخل بريداً صحيحاً وكلمة مرور من ٨ أحرف على الأقل");
    if (editing && form.password && form.password.length < 8) return setError("كلمة المرور الجديدة قصيرة");
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = { name: form.name, phone: form.phone, role: form.role };
        if (form.password) payload.password = form.password;
        const u = await apiPatch<UserRow>(`/api/users/${editing.id}`, payload);
        setItems((p) => p.map((x) => (x.id === u.id ? u : x)));
        toast.push("success", form.password ? "تم التحديث وإعادة تعيين كلمة المرور (أُبطلت جلسات المستخدم)" : "تم تحديث المستخدم");
      } else {
        const u = await apiPost<UserRow>("/api/users", form);
        setItems((p) => [...p, u]);
        toast.push("success", "تم إنشاء المستخدم");
      }
      setModal(false);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); }
    finally { setSaving(false); }
  }

  async function toggleActive(u: UserRow) {
    const prev = items;
    setItems((p) => p.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await apiPatch(`/api/users/${u.id}`, { isActive: !u.isActive });
    } catch (e) {
      setItems(prev);
      toast.push("error", e instanceof Error ? e.message : "تعذر التنفيذ");
    }
  }

  return (
    <div>
      <PageHeader title="مستخدمو المتجر" subtitle="المالك والمديرون والكاشيرون وصلاحياتهم" actions={<Btn onClick={() => { setEditing(null); setForm(empty); setError(""); setModal(true); }}><Plus className="h-4 w-4" /> مستخدم جديد</Btn>} />
      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا يوجد مستخدمون" />
      ) : (
        <TableShell head={["المستخدم", "البريد", "الدور", "آخر دخول", "الحالة", ""]}>
          {items.map((u) => (
            <tr key={u.id} className="border-b border-slate-50">
              <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-400" dir="ltr">{u.phone ?? ""}</p></td>
              <td className="px-4 py-3 tabnums" dir="ltr">{u.email}</td>
              <td className="px-4 py-3"><Badge tone={u.role === "tenant_owner" ? "green" : u.role === "manager" ? "blue" : "slate"}>{ROLE_LABELS[u.role]}</Badge></td>
              <td className="px-4 py-3 text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" }) : "لم يدخل بعد"}</td>
              <td className="px-4 py-3">{u.isActive ? <Badge tone="green">نشط</Badge> : <Badge tone="red">موقوف</Badge>}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(u); setForm({ name: u.name, email: u.email, phone: u.phone ?? "", password: "", role: u.role }); setError(""); setModal(true); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => toggleActive(u)} className={`rounded-lg px-2 py-1.5 text-xs font-bold ${u.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-leaf-50 text-leaf-700 hover:bg-leaf-100"}`}>
                    {u.isActive ? "إيقاف" : "تفعيل"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <p className="font-bold text-slate-800">الأدوار والصلاحيات:</p>
        <p>• <b>مالك المتجر:</b> كل الصلاحيات شاملة المستخدمين والاشتراك وسجل التدقيق.</p>
        <p>• <b>مدير:</b> كل العمليات اليومية والتقارير عدا إدارة المستخدمين والاشتراك.</p>
        <p>• <b>كاشير:</b> نقطة البيع والمبيعات والعملاء والصناديق فقط.</p>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "تعديل مستخدم" : "مستخدم جديد"}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
          <Field label="الاسم" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {!editing && <Field label="البريد الإلكتروني" required><Input type="email" dir="ltr" className="text-left" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="الهاتف"><Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="الدور">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="tenant_owner">مالك متجر</option>
                <option value="manager">مدير</option>
                <option value="cashier">كاشير</option>
              </Select>
            </Field>
          </div>
          <Field label={editing ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور"}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="password" dir="ltr" className="pr-10 text-left" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </div>
          </Field>
          <div className="flex gap-2"><Btn type="submit" loading={saving} className="flex-1">حفظ</Btn><Btn type="button" variant="secondary" onClick={() => setModal(false)}>إلغاء</Btn></div>
        </form>
      </Modal>
    </div>
  );
}
