"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck, ClipboardList, ReceiptText,
  Wallet, Boxes, Landmark, BarChart3, UserCog, CreditCard, Building2, ScrollText,
  Menu, X, LogOut, Leaf, RefreshCw, WifiOff, CloudUpload,
} from "lucide-react";
import { apiPost } from "@/lib/client";
import { getQueue, subscribeQueue, syncQueue, pendingCount } from "@/lib/offline";
import { useToast } from "./ui";
import { ROLE_LABELS, type Permission, type Role } from "@/lib/permissions";

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string | null;
}

const NAV: { href: string; label: string; icon: ReactNode; perm?: Permission }[] = [
  { href: "/dashboard", label: "لوحة التحكم", icon: <LayoutDashboard className="h-5 w-5" />, perm: "dashboard:view" },
  { href: "/pos", label: "نقطة البيع", icon: <ShoppingCart className="h-5 w-5" />, perm: "pos:use" },
  { href: "/sales", label: "المبيعات والفواتير", icon: <ReceiptText className="h-5 w-5" />, perm: "sales:view" },
  { href: "/products", label: "الأصناف والقات", icon: <Package className="h-5 w-5" />, perm: "products:manage" },
  { href: "/purchases", label: "المشتريات", icon: <ClipboardList className="h-5 w-5" />, perm: "purchases:manage" },
  { href: "/customers", label: "العملاء", icon: <Users className="h-5 w-5" />, perm: "customers:manage" },
  { href: "/suppliers", label: "المورّدون", icon: <Truck className="h-5 w-5" />, perm: "suppliers:manage" },
  { href: "/debts", label: "الديون والمستحقات", icon: <Wallet className="h-5 w-5" />, perm: "payments:manage" },
  { href: "/inventory", label: "المخزون والهالك", icon: <Boxes className="h-5 w-5" />, perm: "inventory:manage" },
  { href: "/cash", label: "الصناديق والورديات", icon: <Landmark className="h-5 w-5" />, perm: "cash:manage" },
  { href: "/reports", label: "التقارير", icon: <BarChart3 className="h-5 w-5" />, perm: "reports:view" },
  { href: "/users", label: "المستخدمون", icon: <UserCog className="h-5 w-5" />, perm: "users:manage" },
  { href: "/subscription", label: "الاشتراك والباقة", icon: <CreditCard className="h-5 w-5" />, perm: "subscription:manage" },
  { href: "/audit", label: "سجل التدقيق", icon: <ScrollText className="h-5 w-5" />, perm: "audit:view" },
];

const ADMIN_NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/admin", label: "إدارة المنصة", icon: <Building2 className="h-5 w-5" /> },
];

export default function Shell({
  user, tenantName, isDemo, permissions, children,
}: {
  user: ShellUser;
  tenantName: string | null;
  isDemo: boolean;
  permissions: Permission[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setQueued(pendingCount());
    update();
    const unsub = subscribeQueue(update);
    const onOnline = () => { setOnline(true); void doSync(true); };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSync(silent = false) {
    if (syncing || pendingCount() === 0) return;
    setSyncing(true);
    try {
      const out = await syncQueue();
      if (out.applied + out.duplicates > 0) toast.push("success", `تمت مزامنة ${out.applied + out.duplicates} عملية مع الخادم`);
      if (out.conflicts.length > 0) toast.push("error", `${out.conflicts.length} عملية متعارضة تحتاج مراجعة في نقطة البيع`);
      else if (!silent && out.failed === 0 && out.applied + out.duplicates === 0) toast.push("success", "لا توجد عمليات بانتظار المزامنة");
      if (out.failed > 0) toast.push("error", "تعذّرت مزامنة بعض العمليات، ستتم إعادة المحاولة");
    } catch {
      if (!silent) toast.push("error", "تعذّر الاتصال بالخادم للمزامنة");
    } finally {
      setSyncing(false);
    }
  }

  async function logout() {
    await apiPost("/api/auth/logout").catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const items = user.role === "platform_admin" ? ADMIN_NAV : NAV.filter((n) => !n.perm || permissions.includes(n.perm));

  const sidebar = (
    <div className="flex h-full flex-col bg-leaf-950 text-leaf-50">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-leaf-700">
          <Leaf className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight">مقوات</p>
          <p className="truncate text-xs text-leaf-300">{tenantName ?? "إدارة المنصة"}</p>
        </div>
      </div>

      {isDemo && (
        <div className="mx-3 mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-300">
          بيئة تجريبية — بيانات توضيحية فقط
        </div>
      )}

      <nav className="slim-scroll flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="التنقل الرئيسي">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-leaf-700 text-white shadow" : "text-leaf-100/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.href === "/pos" && queued > 0 && (
                <span className="ms-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{queued}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="mb-3 flex items-center gap-2 text-xs">
          {online ? (
            <span className="inline-flex items-center gap-1.5 text-leaf-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> متصل</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-300"><WifiOff className="h-3.5 w-3.5" /> غير متصل — العمل دون اتصال</span>
          )}
          {queued > 0 && (
            <button onClick={() => doSync()} disabled={syncing} className="ms-auto inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-semibold text-white hover:bg-white/20 disabled:opacity-50">
              {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
              مزامنة ({queued})
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf-700 text-sm font-bold">
            {user.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-leaf-300">{ROLE_LABELS[user.role]}</p>
          </div>
          <button onClick={logout} aria-label="تسجيل الخروج" className="rounded-lg p-2 text-leaf-200 hover:bg-white/10 hover:text-white">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar (right in RTL) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block no-print">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden no-print">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-72 max-w-[85vw] shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden no-print">
          <button onClick={() => setMobileOpen(true)} aria-label="فتح القائمة" className="rounded-lg p-2 text-slate-700 hover:bg-slate-100">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-leaf-700" />
            <span className="font-bold">مقوات</span>
            {tenantName && <span className="text-sm text-slate-500">— {tenantName}</span>}
          </div>
          {queued > 0 && <span className="ms-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{queued} بانتظار المزامنة</span>}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">{children}</main>
        <footer className="px-6 pb-5 text-center text-xs text-slate-400 no-print">
          منصة مقوات لإدارة متاجر القات — جميع الحركات المالية مسجلة وقابلة للتدقيق
        </footer>
      </div>
    </div>
  );
}
