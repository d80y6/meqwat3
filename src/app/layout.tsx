import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "منصة مقوات | Meqwat SaaS",
  description: "منصة سحابية لإدارة متاجر القات والتجارة اليومية — مبيعات، مخزون، ديون، ورديات وصناديق، مع عمل دون اتصال.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
