"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { PageHeader, TableShell, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface LogRow { id: string; action: string; entityType: string | null; userName: string | null; metadata: Record<string, unknown> | null; createdAt: string }

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "تسجيل دخول", "auth.logout": "تسجيل خروج",
  "sale.create": "إنشاء فاتورة بيع", "sale.return": "مرتجع بيع",
  "purchase.create": "فاتورة شراء", "payment.create": "حركة سداد",
  "product.create": "إضافة صنف", "product.update": "تعديل صنف", "product.deactivate": "إيقاف صنف",
  "customer.create": "إضافة عميل", "customer.update": "تعديل عميل", "customer.deactivate": "تعطيل عميل",
  "supplier.create": "إضافة مورّد", "supplier.update": "تعديل مورّد", "supplier.deactivate": "تعطيل مورّد",
  "user.create": "إنشاء مستخدم", "user.update": "تعديل مستخدم",
  "shift.open": "فتح وردية", "shift.close": "إغلاق وردية ومطابقة",
  "register.create": "إنشاء صندوق",
  "inventory.spoilage": "تسجيل هالك", "inventory.adjustment": "تسوية جرد",
  "sync.push": "مزامنة عمليات دون اتصال",
};

export default function AuditPage() {
  const toast = useToast();
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: LogRow[] }>("/api/audit?limit=100");
      setItems(d.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader title="سجل التدقيق" subtitle="كل الإجراءات الحساسة مسجلة بالمستخدم والوقت — للمساءلة وكشف الأخطاء" />
      {loading ? <Loading /> : items.length === 0 ? (
        <EmptyState title="لا توجد سجلات بعد" hint="ستظهر هنا عمليات تسجيل الدخول والمبيعات والسدادات وتعديلات البيانات." />
      ) : (
        <TableShell head={["الوقت", "الإجراء", "الكيان", "المستخدم", "تفاصيل"]}>
          {items.map((l) => (
            <tr key={l.id} className="border-b border-slate-50">
              <td className="px-4 py-3 tabnums text-slate-500">{new Date(l.createdAt).toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="px-4 py-3"><Badge tone="blue">{ACTION_LABEL[l.action] ?? l.action}</Badge></td>
              <td className="px-4 py-3 text-slate-500">{l.entityType ?? "—"}</td>
              <td className="px-4 py-3">{l.userName ?? "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {l.metadata ? Object.entries(l.metadata).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "—"}
              </td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}
