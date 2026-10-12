"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Inbox, CreditCard, Plus, Ban, CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/client";
import { fmtMoney } from "@/lib/money";
import { Btn, Field, Input, Select, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, StatCard, useToast } from "@/components/ui";

interface TenantRow {
  tenant: { id: string; name: string; slug: string; city: string | null; phone: string | null; status: string; isDemo: boolean; createdAt: string };
  planName: string | null; subStatus: string | null; endsAt: string | null; usersCount: number; salesCount: number;
}
interface RequestRow { id: string; businessName: string; ownerName: string; email: string; phone: string; city: string | null; planName: string | null; status: string; notes: string | null; tenantId: string | null; createdAt: string }
interface PlanRow { id: string; name: string; priceMonthly: string; maxUsers: number; maxProducts: number; maxBranches: number; isActive: boolean; features: string[] }

export default function AdminPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"tenants" | "requests" | "plans">("tenants");
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", ownerName: "", email: "", phone: "", city: "", planId: "", isDemo: false });
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string; tenantName: string; emailSent: boolean } | null>(null);
  const [manageFor, setManageFor] = useState<TenantRow | null>(null);
  const [managePlan, setManagePlan] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [planModal, setPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ name: "", priceMonthly: "0", maxUsers: "3", maxProducts: "100", maxBranches: "1" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, r, p] = await Promise.all([
        apiGet<{ items: TenantRow[] }>("/api/admin/tenants"),
        apiGet<{ items: RequestRow[] }>("/api/admin/subscription-requests"),
        apiGet<{ items: PlanRow[] }>("/api/admin/plans"),
      ]);
      setTenants(t.items);
      setRequests(r.items);
      setPlans(p.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل — تأكد من صلاحية مدير المنصة"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const pending = requests.filter((r) => r.status === "pending");

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiPost<{ tenant: { name: string }; owner: { email: string }; tempPassword: string; emailSent: boolean }>("/api/admin/tenants", form);
      setCredentials({ email: res.owner.email, tempPassword: res.tempPassword, tenantName: res.tenant.name, emailSent: res.emailSent });
      setCreateModal(false);
      void load();
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "تعذر الإنشاء"); }
  }

  async function toggleTenant(t: TenantRow) {
    const next = t.tenant.status === "active" ? "suspended" : "active";
    try {
      await apiPatch(`/api/admin/tenants/${t.tenant.id}`, { status: next });
      toast.push("success", next === "suspended" ? "تم إيقاف المتجر" : "تم تفعيل المتجر");
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التنفيذ"); }
  }

  async function applyManage() {
    if (!manageFor) return;
    try {
      await apiPatch(`/api/admin/tenants/${manageFor.tenant.id}`, {
        planId: managePlan || undefined,
        extendDays: extendDays ? Number(extendDays) : undefined,
      });
      toast.push("success", "تم تحديث اشتراك المتجر");
      setManageFor(null);
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحديث"); }
  }

  async function review(req: RequestRow, action: "approve" | "reject") {
    try {
      if (action === "approve") {
        const res = await apiPost<{ tenant: { name: string }; ownerEmail: string; tempPassword: string | null; upgraded: boolean; planName: string; emailSent: boolean }>("/api/admin/subscription-requests", { requestId: req.id, action });
        if (res.upgraded) {
          toast.push("success", `تمت الموافقة — طُبّقت باقة «${res.planName}» على متجر ${res.tenant.name} ومُدّدت ٣٠ يوماً`);
        } else if (res.tempPassword) {
          setCredentials({ email: res.ownerEmail, tempPassword: res.tempPassword, tenantName: res.tenant.name, emailSent: res.emailSent });
          toast.push("success", res.emailSent ? "تمت الموافقة وإنشاء المتجر وأُرسلت بيانات الدخول بالبريد" : "تمت الموافقة وإنشاء المتجر");
        }
      } else {
        await apiPost("/api/admin/subscription-requests", { requestId: req.id, action });
        toast.push("success", "تم رفض الطلب");
      }
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر تنفيذ الإجراء"); }
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiPost("/api/admin/plans", {
        name: planForm.name, priceMonthly: planForm.priceMonthly,
        maxUsers: Number(planForm.maxUsers), maxProducts: Number(planForm.maxProducts), maxBranches: Number(planForm.maxBranches),
      });
      toast.push("success", "تمت إضافة الباقة");
      setPlanModal(false);
      void load();
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "تعذر الحفظ"); }
  }

  const tabs = [
    { key: "tenants" as const, label: "المتاجر المشتركة", icon: <Building2 className="h-4 w-4" /> },
    { key: "requests" as const, label: `طلبات الاشتراك (${pending.length} بانتظار)`, icon: <Inbox className="h-4 w-4" /> },
    { key: "plans" as const, label: "الباقات", icon: <CreditCard className="h-4 w-4" /> },
  ];

  return (
    <div>
      <PageHeader title="إدارة المنصة" subtitle="المتاجر والاشتراكات والباقات — صلاحية مدير المنصة فقط" actions={tab === "tenants" ? <Btn onClick={() => setCreateModal(true)}><Plus className="h-4 w-4" /> إنشاء متجر</Btn> : undefined} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي المتاجر" value={String(tenants.length)} />
        <StatCard label="متاجر نشطة" value={String(tenants.filter((t) => t.tenant.status === "active").length)} />
        <StatCard label="طلبات بانتظار المراجعة" value={String(pending.length)} tone="amber" />
        <StatCard label="بيئات تجريبية" value={String(tenants.filter((t) => t.tenant.isDemo).length)} sub="مفصولة عن متاجر الإنتاج" tone="blue" />
      </div>

      <div className="mb-4 flex gap-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === t.key ? "bg-leaf-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : tab === "tenants" ? (
        tenants.length === 0 ? <EmptyState title="لا توجد متاجر" /> : (
          <TableShell head={["المتجر", "الباقة", "الاشتراك", "المستخدمون", "المبيعات", "الحالة", ""]}>
            {tenants.map((t) => (
              <tr key={t.tenant.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold">{t.tenant.name} {t.tenant.isDemo && <Badge tone="amber">تجريبي</Badge>}</p>
                  <p className="text-xs text-slate-400">{t.tenant.city ?? ""} · منذ {new Date(t.tenant.createdAt).toLocaleDateString("ar-YE")}</p>
                </td>
                <td className="px-4 py-3">{t.planName ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={t.subStatus === "active" ? "green" : t.subStatus === "trial" ? "amber" : "red"}>{t.subStatus ?? "—"}</Badge>
                  {t.endsAt && <p className="mt-0.5 text-xs text-slate-400">حتى {new Date(t.endsAt).toLocaleDateString("ar-YE")}</p>}
                </td>
                <td className="px-4 py-3 tabnums">{t.usersCount}</td>
                <td className="px-4 py-3 tabnums">{t.salesCount}</td>
                <td className="px-4 py-3">{t.tenant.status === "active" ? <Badge tone="green">نشط</Badge> : <Badge tone="red">موقوف</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => { setManageFor(t); setManagePlan(""); setExtendDays("30"); }} className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">إدارة الاشتراك</button>
                    <button onClick={() => toggleTenant(t)} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold ${t.tenant.status === "active" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-leaf-50 text-leaf-700"}`}>
                      {t.tenant.status === "active" ? <><Ban className="h-3.5 w-3.5" /> إيقاف</> : <><CheckCircle2 className="h-3.5 w-3.5" /> تفعيل</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
        )
      ) : tab === "requests" ? (
        requests.length === 0 ? <EmptyState title="لا توجد طلبات اشتراك" hint="الطلبات المرسلة من صفحة التسجيل العامة تظهر هنا." /> : (
          <TableShell head={["المتجر", "المالك", "تواصل", "الباقة", "الحالة", ""]}>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-4 py-3"><p className="font-semibold">{r.businessName} {r.tenantId && <Badge tone="blue">ترقية متجر قائم</Badge>}</p><p className="text-xs text-slate-400">{r.city ?? ""} · {new Date(r.createdAt).toLocaleDateString("ar-YE")}</p>{r.notes && <p className="text-xs text-slate-400">{r.notes}</p>}</td>
                <td className="px-4 py-3">{r.ownerName}</td>
                <td className="px-4 py-3"><p dir="ltr" className="text-left tabnums">{r.phone}</p><p dir="ltr" className="text-left text-xs text-slate-400">{r.email}</p></td>
                <td className="px-4 py-3">{r.planName ?? "—"}</td>
                <td className="px-4 py-3"><Badge tone={r.status === "pending" ? "amber" : r.status === "approved" ? "green" : "red"}>{r.status === "pending" ? "بانتظار المراجعة" : r.status === "approved" ? "مقبول" : "مرفوض"}</Badge></td>
                <td className="px-4 py-3">
                  {r.status === "pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => review(r, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-leaf-700 px-2 py-1.5 text-xs font-bold text-white hover:bg-leaf-800"><CheckCircle2 className="h-3.5 w-3.5" /> قبول وإنشاء</button>
                      <button onClick={() => review(r, "reject")} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"><XCircle className="h-3.5 w-3.5" /> رفض</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )
      ) : (
        <div>
          <TableShell head={["الباقة", "السعر الشهري", "المستخدمون", "الأصناف", "الفروع", "الحالة"]}>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-semibold">{p.name}</td>
                <td className="px-4 py-3 tabnums">{fmtMoney(p.priceMonthly)}</td>
                <td className="px-4 py-3 tabnums">{p.maxUsers}</td>
                <td className="px-4 py-3 tabnums">{p.maxProducts}</td>
                <td className="px-4 py-3 tabnums">{p.maxBranches}</td>
                <td className="px-4 py-3">{p.isActive ? <Badge tone="green">مفعّلة</Badge> : <Badge tone="slate">موقوفة</Badge>}</td>
              </tr>
            ))}
          </TableShell>
          <Btn onClick={() => setPlanModal(true)} className="mt-4"><Plus className="h-4 w-4" /> باقة جديدة</Btn>
        </div>
      )}

      {/* Create tenant */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="إنشاء متجر جديد">
        <form onSubmit={createTenant} className="space-y-4">
          <Field label="اسم المتجر" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم المالك" required><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required /></Field>
            <Field label="الهاتف"><Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="بريد المالك (للدخول)" required><Input type="email" dir="ltr" className="text-left" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المدينة"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="الباقة">
              <Select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                <option value="">الأرخص (افتراضي)</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDemo} onChange={(e) => setForm({ ...form, isDemo: e.target.checked })} className="h-4 w-4 accent-leaf-700" /> بيئة تجريبية (بيانات توضيحية)</label>
          <Btn type="submit" className="w-full">إنشاء المتجر وحساب المالك</Btn>
        </form>
      </Modal>

      {/* One-time credentials */}
      <Modal open={!!credentials} onClose={() => setCredentials(null)} title="بيانات دخول المالك">
        {credentials && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><KeyRound className="h-4 w-4" /> تُعرض كلمة المرور المؤقتة مرة واحدة فقط — سلّمها للمالك واطلب تغييرها.</p>
            <p className={`rounded-lg px-3 py-2 text-sm ${credentials.emailSent ? "bg-leaf-50 text-leaf-800" : "bg-slate-50 text-slate-600"}`}>
              {credentials.emailSent
                ? "✓ أُرسلت بيانات الدخول إلى بريد المالك عبر SMTP."
                : "لم يُرسَل بريد تلقائياً (SMTP غير مهيّأ في هذه البيئة) — سلّم البيانات للمالك يدوياً."}
            </p>
            <div className="rounded-xl bg-slate-50 p-4 text-sm leading-8">
              <p>المتجر: <b>{credentials.tenantName}</b></p>
              <p>البريد: <b dir="ltr">{credentials.email}</b></p>
              <p>كلمة المرور المؤقتة: <b dir="ltr" className="select-all">{credentials.tempPassword}</b></p>
            </div>
            <Btn onClick={() => setCredentials(null)} className="w-full">تم الحفظ</Btn>
          </div>
        )}
      </Modal>

      {/* Manage subscription */}
      <Modal open={!!manageFor} onClose={() => setManageFor(null)} title={`إدارة اشتراك — ${manageFor?.tenant.name ?? ""}`}>
        <div className="space-y-4">
          <Field label="تغيير الباقة">
            <Select value={managePlan} onChange={(e) => setManagePlan(e.target.value)}>
              <option value="">بدون تغيير</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.priceMonthly)}/شهر</option>)}
            </Select>
          </Field>
          <Field label="تمديد الاشتراك (أيام من اليوم/من الانتهاء)">
            <Input type="number" min="0" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="ltr-nums" />
          </Field>
          <Btn onClick={applyManage} className="w-full">حفظ التعديلات</Btn>
        </div>
      </Modal>

      {/* New plan */}
      <Modal open={planModal} onClose={() => setPlanModal(false)} title="باقة جديدة">
        <form onSubmit={savePlan} className="space-y-4">
          <Field label="اسم الباقة" required><Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="السعر الشهري (ر.ي)"><Input type="number" min="0" value={planForm.priceMonthly} onChange={(e) => setPlanForm({ ...planForm, priceMonthly: e.target.value })} className="ltr-nums" /></Field>
            <Field label="حد المستخدمين"><Input type="number" min="1" value={planForm.maxUsers} onChange={(e) => setPlanForm({ ...planForm, maxUsers: e.target.value })} className="ltr-nums" /></Field>
            <Field label="حد الأصناف"><Input type="number" min="1" value={planForm.maxProducts} onChange={(e) => setPlanForm({ ...planForm, maxProducts: e.target.value })} className="ltr-nums" /></Field>
            <Field label="حد الفروع"><Input type="number" min="1" value={planForm.maxBranches} onChange={(e) => setPlanForm({ ...planForm, maxBranches: e.target.value })} className="ltr-nums" /></Field>
          </div>
          <Btn type="submit" className="w-full">إضافة الباقة</Btn>
        </form>
      </Modal>
    </div>
  );
}
