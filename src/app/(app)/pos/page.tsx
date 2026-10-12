"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Minus, Trash2, User, Banknote, WifiOff, CloudUpload, RefreshCw,
  CheckCircle2, AlertTriangle, ShoppingCart, Landmark, XCircle,
} from "lucide-react";
import { apiGet, apiPost, ClientError, newMutationId } from "@/lib/client";
import { enqueue, getQueue, removeOp, subscribeQueue, syncQueue, isOnline, type QueuedOp } from "@/lib/offline";
import { fmtMoney, toCents, fromCents, mulQtyPrice } from "@/lib/money";
import { Btn, Field, Input, Select, Modal, PageHeader, Badge, EmptyState, Loading, useToast } from "@/components/ui";

interface Product { id: string; name: string; unit: string; salePrice: string; costPrice: string; stockQty: string; trackStock: boolean }
interface Customer { id: string; name: string; balance: string; creditLimit: string }
interface Register { id: string; name: string }
interface Shift { id: string; registerId: string; openingCash: string; openedAt: string }
interface CartLine { product: Product; qty: number; unitPrice: string }

export default function PosPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [openShifts, setOpenShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [shiftId, setShiftId] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNo: number; total: string; offline?: boolean } | null>(null);
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [openingRegister, setOpeningRegister] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, c, r] = await Promise.all([
        apiGet<{ items: Product[] }>("/api/products?active=1&limit=200"),
        apiGet<{ items: Customer[] }>("/api/customers?limit=200"),
        apiGet<{ registers: Register[]; openShifts: Shift[] }>("/api/registers"),
      ]);
      setProducts(p.items);
      setCustomers(c.items);
      setRegisters(r.registers);
      setOpenShifts(r.openShifts);
      if (r.openShifts.length > 0) setShiftId((cur) => cur || r.openShifts[0].id);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "تعذر تحميل بيانات نقطة البيع");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const update = () => setQueue(getQueue());
    update();
    const unsub = subscribeQueue(update);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(isOnline());
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { unsub(); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const filtered = useMemo(
    () => products.filter((p) => !search || p.name.includes(search)),
    [products, search],
  );

  const grossCents = useMemo(
    () => cart.reduce((sum, l) => sum + toCents(mulQtyPrice(l.qty, l.unitPrice)), 0),
    [cart],
  );
  const discountCents = Math.min(toCents(discount || 0), grossCents);
  const netCents = grossCents - discountCents;
  const paidCents = paidTouched ? toCents(paid || 0) : netCents;
  const creditCents = Math.max(0, netCents - paidCents);
  const customer = customers.find((c) => c.id === customerId);

  function addToCart(p: Product) {
    setCart((cur) => {
      const existing = cur.find((l) => l.product.id === p.id);
      if (existing) return cur.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...cur, { product: p, qty: 1, unitPrice: p.salePrice }];
    });
  }
  function setQty(id: string, qty: number) {
    setCart((cur) => cur.map((l) => (l.product.id === id ? { ...l, qty: Math.max(0, qty) } : l)).filter((l) => l.qty > 0));
  }

  function resetSale() {
    setCart([]);
    setDiscount("");
    setPaid("");
    setPaidTouched(false);
    setCustomerId("");
  }

  async function checkout() {
    if (cart.length === 0) return toast.push("error", "أضف صنفاً واحداً على الأقل");
    if (paidCents > netCents) return toast.push("error", "المبلغ المدفوع أكبر من صافي الفاتورة");
    if (creditCents > 0 && !customerId) return toast.push("error", "البيع بالآجل يتطلب اختيار عميل");
    if (creditCents > 0 && customer && Number(customer.creditLimit) > 0 && toCents(customer.balance) + creditCents > toCents(customer.creditLimit)) {
      return toast.push("error", "تجاوز العميل حد الائتمان المسموح");
    }
    const activeShift = openShifts.find((s) => s.id === shiftId);
    const payload = {
      customerId: customerId || null,
      shiftId: activeShift?.id ?? null,
      registerId: activeShift?.registerId ?? null,
      items: cart.map((l) => ({ productId: l.product.id, qty: String(l.qty), unitPrice: l.unitPrice })),
      discount: fromCents(discountCents),
      paidAmount: fromCents(paidCents),
      source: "pos",
    };
    const label = `فاتورة بيع — ${cart.length} صنف — ${fmtMoney(fromCents(netCents))}`;
    setCheckingOut(true);
    try {
      if (!isOnline()) throw new TypeError("offline");
      const res = await apiPost<{ invoiceNo: number; totalAmount: string; duplicated?: boolean }>("/api/sales", {
        ...payload, clientMutationId: newMutationId(),
      });
      setLastInvoice({ invoiceNo: res.invoiceNo, total: res.totalAmount });
      toast.push("success", res.duplicated ? "تم تأكيد الفاتورة (كانت مُرسلة مسبقاً)" : `تم حفظ الفاتورة #${res.invoiceNo}`);
      resetSale();
      void load();
    } catch (err) {
      if (err instanceof ClientError) {
        toast.push("error", err.message);
      } else {
        // Network/offline: queue locally with a stable idempotency key.
        enqueue("sale", payload, label);
        setLastInvoice({ invoiceNo: 0, total: fromCents(netCents), offline: true });
        toast.push("success", "لا يوجد اتصال — حُفظت الفاتورة محلياً وستُزامَن تلقائياً");
        resetSale();
      }
    } finally {
      setCheckingOut(false);
    }
  }

  async function doSync() {
    setSyncing(true);
    try {
      const out = await syncQueue();
      if (out.applied + out.duplicates) toast.push("success", `تمت مزامنة ${out.applied + out.duplicates} فاتورة`);
      if (out.conflicts.length) toast.push("error", `${out.conflicts.length} عملية متعارضة تحتاج مراجعة`);
      void load();
    } catch {
      toast.push("error", "تعذّرت المزامنة — تحقق من الاتصال");
    } finally {
      setSyncing(false);
    }
  }

  async function openShift() {
    if (!openingRegister) return toast.push("error", "اختر الصندوق");
    try {
      const shift = await apiPost<Shift>("/api/shifts", { registerId: openingRegister, openingCash });
      setOpenShifts((s) => [shift, ...s]);
      setShiftId(shift.id);
      setOpenShiftModal(false);
      toast.push("success", "تم فتح الوردية");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "تعذر فتح الوردية");
    }
  }

  if (loading) return <Loading label="جارٍ تجهيز نقطة البيع..." />;

  return (
    <div>
      <PageHeader
        title="نقطة البيع"
        subtitle="بيع سريع للقات — نقدي، آجل، أو مختلط"
        actions={
          <>
            {!online && <Badge tone="amber"><WifiOff className="h-3.5 w-3.5" /> وضع دون اتصال</Badge>}
            {queue.length > 0 && (
              <Btn variant="amber" onClick={doSync} loading={syncing}>
                <CloudUpload className="h-4 w-4" /> مزامنة ({queue.length})
              </Btn>
            )}
            <Btn variant="secondary" onClick={() => { setOpeningRegister(registers[0]?.id ?? ""); setOpenShiftModal(true); }}>
              <Landmark className="h-4 w-4" /> فتح وردية
            </Btn>
          </>
        }
      />

      {/* Shift selector */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <Landmark className="h-5 w-5 text-leaf-700" />
        {openShifts.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد وردية مفتوحة — يمكنك البيع الآن وفتح وردية لاحقاً، لكن يُنصح بفتح وردية لمطابقة النقد.</p>
        ) : (
          <>
            <label htmlFor="shift" className="text-sm font-medium text-slate-600">الوردية الحالية:</label>
            <Select id="shift" value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="w-auto">
              {openShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {registers.find((r) => r.id === s.registerId)?.name ?? "صندوق"} — بدأت {new Date(s.openedAt).toLocaleTimeString("ar-YE", { hour: "2-digit", minute: "2-digit" })} برصيد {fmtMoney(s.openingCash)}
                </option>
              ))}
            </Select>
          </>
        )}
      </div>

      {lastInvoice && (
        <div className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 ${lastInvoice.offline ? "border-amber-200 bg-amber-50" : "border-leaf-200 bg-leaf-50"}`} role="status">
          {lastInvoice.offline ? <AlertTriangle className="h-6 w-6 text-amber-600" /> : <CheckCircle2 className="h-6 w-6 text-leaf-700" />}
          <div className="flex-1">
            <p className="font-bold text-slate-900">
              {lastInvoice.offline ? "فاتورة معلّقة محلياً (بانتظار المزامنة)" : `تم إصدار الفاتورة #${lastInvoice.invoiceNo} بنجاح`}
            </p>
            <p className="text-sm text-slate-600">الإجمالي: {fmtMoney(lastInvoice.total)}{lastInvoice.offline ? " — ستظهر في المبيعات بعد المزامنة" : ""}</p>
          </div>
          <button onClick={() => setLastInvoice(null)} className="text-slate-400 hover:text-slate-600" aria-label="إغلاق التنبيه"><XCircle className="h-5 w-5" /></button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Products */}
        <div className="lg:col-span-3">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف قات…" className="pr-10 bg-white" aria-label="بحث الأصناف" />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="لا توجد أصناف مطابقة" hint="جرّب كلمة بحث أخرى أو أضف أصنافاً من صفحة الأصناف." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((p) => {
                const out = p.trackStock && Number(p.stockQty) <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={out}
                    className="rounded-2xl border border-slate-200 bg-white p-3 text-right shadow-sm transition hover:border-leaf-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <p className="font-bold text-slate-900">{p.name}</p>
                    <p className="mt-1 text-lg font-bold text-leaf-800 tabnums">{fmtMoney(p.salePrice)}</p>
                    <p className="text-xs text-slate-400">
                      {p.trackStock ? (out ? "نفد المخزون" : `المتاح ${p.stockQty} ${p.unit}`) : "متاح دائماً"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="sticky top-4 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <ShoppingCart className="h-5 w-5 text-leaf-700" />
              <h2 className="font-bold text-slate-900">سلة البيع</h2>
              <span className="ms-auto text-sm text-slate-400">{cart.length} صنف</span>
            </div>
            <div className="slim-scroll max-h-72 space-y-2 overflow-y-auto px-4 py-3">
              {cart.length === 0 && <p className="py-8 text-center text-sm text-slate-400">اختر أصنافاً من القائمة لإضافتها هنا</p>}
              {cart.map((l) => (
                <div key={l.product.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{l.product.name}</p>
                    <button onClick={() => setQty(l.product.id, 0)} className="text-red-500 hover:text-red-700" aria-label={`حذف ${l.product.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => setQty(l.product.id, l.qty - 1)} className="rounded-lg bg-white p-1.5 shadow-sm" aria-label="إنقاص الكمية"><Minus className="h-4 w-4" /></button>
                    <input
                      type="number" min="0" step="0.5" value={l.qty} aria-label="الكمية"
                      onChange={(e) => setQty(l.product.id, Number(e.target.value))}
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm ltr-nums"
                    />
                    <button onClick={() => setQty(l.product.id, l.qty + 1)} className="rounded-lg bg-white p-1.5 shadow-sm" aria-label="زيادة الكمية"><Plus className="h-4 w-4" /></button>
                    <span className="text-xs text-slate-400">{l.product.unit} ×</span>
                    <input
                      type="number" min="0" step="any" value={l.unitPrice} aria-label="سعر الوحدة"
                      onChange={(e) => setCart((cur) => cur.map((x) => (x.product.id === l.product.id ? { ...x, unitPrice: e.target.value } : x)))}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm ltr-nums"
                    />
                    <span className="ms-auto font-bold tabnums">{fmtMoney(mulQtyPrice(l.qty, l.unitPrice))}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t border-slate-100 px-4 py-4">
              <Field label="العميل (مطلوب للآجل)">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">عميل نقدي (بدون حساب)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{Number(c.balance) > 0 ? ` — دين ${fmtMoney(c.balance)}` : ""}</option>
                  ))}
                </Select>
              </Field>
              {customer && Number(customer.balance) > 0 && (
                <p className="flex items-center gap-1 text-xs text-amber-700"><User className="h-3.5 w-3.5" /> رصيد العميل الحالي: {fmtMoney(customer.balance)}{Number(customer.creditLimit) > 0 ? ` من حد ${fmtMoney(customer.creditLimit)}` : ""}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="خصم (ر.ي)">
                  <Input type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className="ltr-nums" placeholder="0" />
                </Field>
                <Field label="المبلغ المدفوع نقداً">
                  <Input
                    type="number" min="0" step="any" value={paidTouched ? paid : (netCents ? String(netCents / 100) : "")}
                    onChange={(e) => { setPaid(e.target.value); setPaidTouched(true); }}
                    className="ltr-nums" placeholder={String(netCents / 100)}
                  />
                </Field>
              </div>
              <div className="space-y-1 rounded-xl bg-leaf-50 p-3 text-sm">
                <div className="flex justify-between"><span>الإجمالي</span><span className="tabnums">{fmtMoney(fromCents(grossCents))}</span></div>
                {discountCents > 0 && <div className="flex justify-between text-slate-500"><span>الخصم</span><span className="tabnums">-{fmtMoney(fromCents(discountCents))}</span></div>}
                <div className="flex justify-between border-t border-leaf-100 pt-1 text-base font-bold"><span>الصافي</span><span className="tabnums">{fmtMoney(fromCents(netCents))}</span></div>
                {creditCents > 0 && <div className="flex justify-between font-semibold text-amber-700"><span>يُرحَّل كدين على العميل</span><span className="tabnums">{fmtMoney(fromCents(creditCents))}</span></div>}
                {paidTouched && paidCents > netCents && <p className="text-xs font-semibold text-red-600">المبلغ المدفوع أكبر من الصافي</p>}
              </div>
              <Btn onClick={checkout} loading={checkingOut} className="w-full py-3 text-base">
                <Banknote className="h-5 w-5" /> إتمام البيع {netCents > 0 ? `— ${fmtMoney(fromCents(netCents))}` : ""}
              </Btn>
              {!online && <p className="text-center text-xs text-amber-700">أنت غير متصل — ستُحفظ الفاتورة محلياً وتُزامَن لاحقاً برقم مرجعي ثابت يمنع التكرار.</p>}
            </div>
          </div>

          {/* Offline queue */}
          {queue.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold text-amber-900">عمليات محلية بانتظار التأكيد ({queue.length})</h3>
                <Btn variant="amber" onClick={doSync} loading={syncing} className="px-3 py-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" /> مزامنة الآن</Btn>
              </div>
              <ul className="space-y-2">
                {queue.map((op) => (
                  <li key={op.clientMutationId} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
                    <Badge tone={op.status === "conflict" ? "red" : "amber"}>{op.status === "conflict" ? "تعارض" : "معلّقة"}</Badge>
                    <span className="flex-1">{op.label}</span>
                    {op.error && <span className="max-w-[40%] truncate text-xs text-red-600" title={op.error}>{op.error}</span>}
                    {op.status === "conflict" && (
                      <button onClick={() => removeOp(op.clientMutationId)} className="text-xs font-semibold text-red-600 hover:underline">تجاهل</button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800">العمليات المعلّقة لم تُخصم من المخزون أو الديون على الخادم بعد. المتعارضة رفضها الخادم (مثلاً نفد المخزون) — راجعها ثم تجاهلها أو أعد البيع.</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={openShiftModal} onClose={() => setOpenShiftModal(false)} title="فتح وردية جديدة">
        <div className="space-y-4">
          <Field label="الصندوق" required>
            <Select value={openingRegister} onChange={(e) => setOpeningRegister(e.target.value)}>
              {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="النقد الافتتاحي في الدرج (ر.ي)">
            <Input type="number" min="0" step="any" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="ltr-nums" />
          </Field>
          <Btn onClick={openShift} className="w-full">فتح الوردية</Btn>
        </div>
      </Modal>
    </div>
  );
}
