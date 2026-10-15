"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Power, PackagePlus } from "lucide-react";
import { apiCollection, apiPost, apiPatch, apiDelete } from "@/lib/client";
import { fmtMoney, fmtQty } from "@/lib/money";
import { Btn, Field, Input, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Product {
  id: string; name: string; sku: string | null; category: string; unit: string;
  costPrice: string; salePrice: string; stockQty: string; lowStockThreshold: string;
  trackStock: boolean; isActive: boolean;
}

const emptyForm = { name: "", sku: "", category: "قات", unit: "حزمة", costPrice: "", salePrice: "", openingQty: "", lowStockThreshold: "5" };

export default function ProductsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiCollection<Product>(`/api/products?limit=100&search=${encodeURIComponent(search)}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModal(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, sku: p.sku ?? "", category: p.category, unit: p.unit, costPrice: p.costPrice, salePrice: p.salePrice, openingQty: "", lowStockThreshold: p.lowStockThreshold });
    setFormError("");
    setModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) return setFormError("اسم الصنف مطلوب");
    if (Number(form.salePrice) < 0 || Number(form.costPrice) < 0) return setFormError("الأسعار يجب ألا تكون سالبة");
    setSaving(true);
    try {
      if (editing) {
        const updated = await apiPatch<Product>(`/api/products/${editing.id}`, form);
        setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast.push("success", "تم تحديث الصنف");
      } else {
        const created = await apiPost<Product>("/api/products", form);
        setItems((prev) => [created, ...prev]); // optimistic position, server-confirmed
        setTotal((t) => t + 1);
        toast.push("success", "تمت إضافة الصنف");
      }
      setModal(false);
    } catch (err) {
      // Rollback: reload authoritative state from server.
      void load();
      setFormError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    const prev = items;
    setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      if (p.isActive) await apiDelete(`/api/products/${p.id}`);
      else await apiPatch(`/api/products/${p.id}`, { isActive: true });
      toast.push("success", p.isActive ? "تم إيقاف الصنف" : "تم تفعيل الصنف");
    } catch (e) {
      setItems(prev); // rollback optimistic update
      toast.push("error", e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    }
  }

  return (
    <div>
      <PageHeader
        title="الأصناف وأصناف القات"
        subtitle={`${total} صنف مسجل في متجرك`}
        actions={<Btn onClick={openCreate}><Plus className="h-4 w-4" /> صنف جديد</Btn>}
      />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الصنف…" className="pr-10" aria-label="بحث الأصناف" />
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState
          title="لا توجد أصناف بعد"
          hint="أضف أصناف القات التي تبيعها (همداني، بلدي، عماري…) مع أسعار الشراء والبيع وكمية الافتتاح."
          action={<Btn onClick={openCreate}><PackagePlus className="h-4 w-4" /> إضافة أول صنف</Btn>}
        />
      ) : (
        <TableShell head={["الصنف", "الوحدة", "سعر الشراء", "سعر البيع", "المخزون", "الحالة", "إجراءات"]}>
          {items.map((p) => {
            const low = p.trackStock && Number(p.stockQty) <= Number(p.lowStockThreshold);
            return (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.category}{p.sku ? ` · ${p.sku}` : ""}</p>
                </td>
                <td className="px-4 py-3">{p.unit}</td>
                <td className="px-4 py-3 tabnums">{fmtMoney(p.costPrice)}</td>
                <td className="px-4 py-3 tabnums font-semibold">{fmtMoney(p.salePrice)}</td>
                <td className="px-4 py-3">
                  {p.trackStock ? (
                    <Badge tone={low ? "red" : "green"}>{fmtQty(p.stockQty)} {p.unit}{low ? " — منخفض" : ""}</Badge>
                  ) : (
                    <span className="text-slate-400">لا يُتتبع</span>
                  )}
                </td>
                <td className="px-4 py-3">{p.isActive ? <Badge tone="green">مفعّل</Badge> : <Badge tone="slate">موقوف</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`تعديل ${p.name}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => toggleActive(p)} className={`rounded-lg p-2 hover:bg-slate-100 ${p.isActive ? "text-red-500" : "text-leaf-600"}`} aria-label={p.isActive ? "إيقاف الصنف" : "تفعيل الصنف"}><Power className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </TableShell>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "تعديل صنف" : "صنف جديد"}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{formError}</div>}
          <Field label="اسم الصنف" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: قات همداني فاخر" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="التصنيف">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="وحدة القياس">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="سعر الشراء (ر.ي)">
              <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="ltr-nums" />
            </Field>
            <Field label="سعر البيع (ر.ي)">
              <Input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} className="ltr-nums" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <Field label="كمية الافتتاح">
                <Input type="number" min="0" step="0.001" value={form.openingQty} onChange={(e) => setForm({ ...form, openingQty: e.target.value })} className="ltr-nums" />
              </Field>
            )}
            <Field label="حد تنبيه انخفاض المخزون">
              <Input type="number" min="0" step="0.001" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} className="ltr-nums" />
            </Field>
            <Field label="رمز الصنف (SKU)">
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} dir="ltr" className="text-left" />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <Btn type="submit" loading={saving} className="flex-1">{editing ? "حفظ التعديلات" : "إضافة الصنف"}</Btn>
            <Btn type="button" variant="secondary" onClick={() => setModal(false)}>إلغاء</Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}
