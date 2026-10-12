"use client";

import { fmtMoney, fmtQty } from "@/lib/money";

export interface ReceiptItem { productName: string; unit: string; qty: string; unitPrice: string; total: string }
export interface ReceiptData {
  invoiceNo: number;
  saleDate: string;
  customerName: string | null;
  items: ReceiptItem[];
  totalAmount: string;
  discount: string;
  paidAmount: string;
  creditAmount: string;
  returnedAmount: string;
  status: string;
}

/**
 * 80mm thermal receipt. Rendered inside #receipt-print; print CSS in
 * globals.css hides the whole app and prints only this element.
 */
export default function Receipt({ tenantName, sale }: { tenantName: string; sale: ReceiptData }) {
  const net = Number(sale.totalAmount) - Number(sale.discount);
  return (
    <div id="receipt-print" dir="rtl" className="mx-auto w-[80mm] max-w-full bg-white p-3 font-sans text-[12px] leading-5 text-black">
      <div className="text-center">
        <p className="text-base font-bold">{tenantName}</p>
        <p>فاتورة بيع — منصة مقوات</p>
        <p>----------------------------------</p>
      </div>
      <div className="flex justify-between">
        <span>رقم الفاتورة: #{sale.invoiceNo}</span>
        <span>{new Date(sale.saleDate).toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
      <p>العميل: {sale.customerName ?? "نقدي"}</p>
      <p>----------------------------------</p>
      <table className="w-full">
        <thead>
          <tr className="text-right">
            <th className="py-0.5">الصنف</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td className="py-0.5">{it.productName}</td>
              <td>{fmtQty(it.qty)} {it.unit}</td>
              <td>{fmtMoney(it.unitPrice, "")}</td>
              <td>{fmtMoney(it.total, "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>----------------------------------</p>
      <div className="space-y-0.5">
        <div className="flex justify-between"><span>الإجمالي</span><span>{fmtMoney(sale.totalAmount)}</span></div>
        {Number(sale.discount) > 0 && <div className="flex justify-between"><span>الخصم</span><span>-{fmtMoney(sale.discount)}</span></div>}
        <div className="flex justify-between font-bold"><span>الصافي</span><span>{fmtMoney(net)}</span></div>
        <div className="flex justify-between"><span>المدفوع</span><span>{fmtMoney(sale.paidAmount)}</span></div>
        {Number(sale.creditAmount) > 0 && <div className="flex justify-between"><span>آجل (دين على العميل)</span><span>{fmtMoney(sale.creditAmount)}</span></div>}
        {Number(sale.returnedAmount) > 0 && <div className="flex justify-between"><span>مرتجعات</span><span>-{fmtMoney(sale.returnedAmount)}</span></div>}
      </div>
      <p>----------------------------------</p>
      <p className="text-center">شكراً لتعاملكم معنا</p>
      <p className="text-center text-[10px]">فاتورة إلكترونية صادرة من نظام مقوات — قابلة للتحقق من سجل المبيعات</p>
    </div>
  );
}
