"use client";

import { createContext, useCallback, useContext, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle, Inbox } from "lucide-react";

/* --------------------------------- Toasts --------------------------------- */
interface Toast { id: number; kind: "success" | "error"; message: string }
const ToastCtx = createContext<{ push: (kind: Toast["kind"], message: string) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 no-print" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-up flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "success" ? "bg-leaf-800 text-white" : "bg-red-700 text-white"
            }`}
          >
            {t.kind === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="إغلاق التنبيه" className="opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* --------------------------------- Buttons -------------------------------- */
type BtnVariant = "primary" | "secondary" | "danger" | "ghost" | "amber";
const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-leaf-700 text-white hover:bg-leaf-800 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-slate-600 hover:bg-slate-100",
  amber: "bg-sand-500 text-white hover:bg-amber-600 shadow-sm",
};
export function Btn({ variant = "primary", className = "", loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${btnStyles[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {props.children}
    </button>
  );
}

/* ---------------------------------- Forms --------------------------------- */
export function Field({ label, error, children, required }: { label: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-leaf-600 focus:outline-none focus:ring-2 focus:ring-leaf-100 disabled:bg-slate-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/* ---------------------------------- Modal --------------------------------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 animate-fade-in no-print" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`animate-slide-up max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------- Cards --------------------------------- */
export function StatCard({ label, value, sub, icon, tone = "leaf" }: { label: string; value: string; sub?: string; icon?: ReactNode; tone?: "leaf" | "amber" | "red" | "blue" }) {
  const tones = {
    leaf: "bg-leaf-50 text-leaf-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-slate-900 tabnums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <div className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-leaf-100 text-leaf-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-sky-100 text-sky-700",
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <Inbox className="h-10 w-10 text-slate-300" />
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "جارٍ التحميل..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Simple data table shell with consistent styling. */
export function TableShell({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-right">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold text-slate-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
