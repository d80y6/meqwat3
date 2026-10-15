"use client";

import { useCallback, useEffect, useState } from "react";
import { HandCoins, Wallet, Truck } from "lucide-react";
import { apiCollection, apiGet, apiPost } from "@/lib/client";
import { fmtMoney, subMoney } from "@/lib/money";
import { Btn, Field, Input, Modal, PageHeader, TableShell, Badge, EmptyState, Loading, StatCard, useToast } from "@/components/ui";

interface Party { id: string; name: string; phone: string | null; balance: string; creditLimit?: string }
interface PaymentRow { id: string; kind: string; partyName: string | null; amount: string; method: string; createdAt: string }

const KIND_LABEL: Record<string, string> = {
  customer_payment: "تحصيل من عميل",
  supplier_payment: "سداد لمورّد",
  sale_payment: "دفعة فاتورة بيع",
  sale_refund: "ردّ مرتجع",
};

export default function DebtsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"customers" | "suppliers" | "payments">("customers");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [totals, setTotals] = useState({receivables:"0",payables:"0"});
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<{ party: Party; kind: "customer_payment" | "supplier_payment" } | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, p, summary] = await Promise.all([
        apiCollection<Party>("/api/customers?debt=1&limit=200"),
        apiCollection<Party>("/api/suppliers?debt=1&limit=200"),
        apiCollection<PaymentRow>("/api/payments?limit=50"),
        apiGet<{receivables:string;payables:string}>("/api/debts/summary"),
      ]);
      setTotals(summary);
      setCustomers(c.items);
      setSuppliers(s.items);
      setPayments(p.items);
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التحميل"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const totalReceivables = totals.receivables;
  const totalPayables = totals.payables;

  async function submitPayment() {
    if (!payTarget) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return toast.push("error", "أدخل مبلغاً صحيحاً");
    if (amt > Number(payTarget.party.balance)) return toast.push("error", "المبلغ أكبر من الرصيد المستحق");
    try {
      const res = await apiPost<{ newBalance: string }>("/api/payments", {
        kind: payTarget.kind,
        customerId: payTarget.kind === "customer_payment" ? payTarget.party.id : undefined,
        supplierId: payTarget.kind === "supplier_payment" ? payTarget.party.id : undefined,
        amount: payAmount,
      });
      toast.push("success", `تم التسجيل — الرصيد المتبقي ${fmtMoney(res.newBalance)}`);
      setPayTarget(null);
      void load();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "تعذر التسجيل"); }
  }

  const tabs = [
    { key: "customers" as const, label: `ديون العملاء (${customers.length})` },
    { key: "suppliers" as const, label: `مستحقات المورّدين (${suppliers.length})` },
    { key: "payments" as const, label: "سجل المدفوعات" },
  ];

  return (
    <div>
      <PageHeader title="الديون والمستحقات" subtitle="أرصدة الآجل للعملاء ومستحقات المورّدين والوكالات — محدثة مع كل حركة" />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="إجمالي ديون العملاء (لنا)" value={fmtMoney(totalReceivables)} icon={<Wallet className="h-5 w-5" />} tone="amber" />
        <StatCard label="إجمالي مستحقات المورّدين (علينا)" value={fmtMoney(totalPayables)} icon={<Truck className="h-5 w-5" />} tone="red" />
        <StatCard label="صافي المركز الائتماني" value={fmtMoney(subMoney(totalReceivables, totalPayables))} sub="الديون لنا ناقص المستحقات علينا" icon={<HandCoins className="h-5 w-5" />} />
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="أقسام الديون">
        {tabs.map((t) => (
          <button
            key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-leaf-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : tab === "customers" ? (
        customers.length === 0 ? <EmptyState title="لا توجد ديون عملاء" hint="كل العملاء خالصون — لا أرصدة آجلة مستحقة." /> : (
          <TableShell head={["العميل", "الهاتف", "حد الائتمان", "المستحق", ""]}>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3 tabnums" dir="ltr">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 tabnums">{Number(c.creditLimit) > 0 ? fmtMoney(c.creditLimit ?? 0) : "بدون حد"}</td>
                <td className="px-4 py-3"><Badge tone="amber">{fmtMoney(c.balance)}</Badge></td>
                <td className="px-4 py-3">
                  <button onClick={() => { setPayTarget({ party: c, kind: "customer_payment" }); setPayAmount(c.balance); }} className="inline-flex items-center gap-1 rounded-lg bg-leaf-50 px-3 py-1.5 text-xs font-bold text-leaf-800 hover:bg-leaf-100">
                    <HandCoins className="h-4 w-4" /> تحصيل
                  </button>
                </td>
              </tr>
            ))}
          </TableShell>
        )
      ) : tab === "suppliers" ? (
        suppliers.length === 0 ? <EmptyState title="لا توجد مستحقات مورّدين" hint="كل المورّدين خالصون." /> : (
          <TableShell head={["المورّد", "الهاتف", "المستحق له", ""]}>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-semibold">{s.name}</td>
                <td className="px-4 py-3 tabnums" dir="ltr">{s.phone ?? "—"}</td>
                <td className="px-4 py-3"><Badge tone="red">{fmtMoney(s.balance)}</Badge></td>
                <td className="px-4 py-3">
                  <button onClick={() => { setPayTarget({ party: s, kind: "supplier_payment" }); setPayAmount(s.balance); }} className="inline-flex items-center gap-1 rounded-lg bg-leaf-50 px-3 py-1.5 text-xs font-bold text-leaf-800 hover:bg-leaf-100">
                    <HandCoins className="h-4 w-4" /> سداد
                  </button>
                </td>
              </tr>
            ))}
          </TableShell>
        )
      ) : payments.length === 0 ? (
        <EmptyState title="لا توجد مدفوعات مسجلة" hint="دفعات الفواتير والتحصيلات والسدادات تظهر هنا." />
      ) : (
        <TableShell head={["التاريخ", "النوع", "الطرف", "المبلغ", "الوسيلة"]}>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-slate-50">
              <td className="px-4 py-3 tabnums">{new Date(p.createdAt).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-4 py-3">{KIND_LABEL[p.kind] ?? p.kind}</td>
              <td className="px-4 py-3">{p.partyName ?? "—"}</td>
              <td className="px-4 py-3 tabnums font-semibold">{fmtMoney(p.amount)}</td>
              <td className="px-4 py-3">{p.method === "cash" ? "نقدي" : p.method}</td>
            </tr>
          ))}
        </TableShell>
      )}

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title={payTarget?.kind === "customer_payment" ? `تحصيل من ${payTarget.party.name}` : `سداد إلى ${payTarget?.party.name ?? ""}`}>
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">الرصيد المستحق: <b>{fmtMoney(payTarget?.party.balance ?? 0)}</b></p>
          <Field label="المبلغ (ر.ي)" required>
            <Input type="number" min="0" step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="ltr-nums" />
          </Field>
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => setPayAmount(payTarget?.party.balance ?? "")}>كامل المبلغ</Btn>
            <Btn onClick={submitPayment} className="flex-1">تأكيد</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
