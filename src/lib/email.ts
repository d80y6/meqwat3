import nodemailer from "nodemailer";

/**
 * Optional SMTP delivery. When SMTP_HOST/SMTP_USER/SMTP_PASS are configured,
 * new shop owners receive their one-time credentials by email. Without SMTP
 * configuration this is a no-op and the platform admin hands the credentials
 * over manually (they are shown exactly once in the admin console).
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendOwnerCredentials(input: {
  to: string;
  tenantName: string;
  tempPassword: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: input.to,
      subject: `بيانات دخول متجرك على منصة مقوات — ${input.tenantName}`,
      text: [
        `مرحباً بك في منصة مقوات.`,
        `تم إنشاء متجرك: ${input.tenantName}`,
        `البريد الإلكتروني: ${input.to}`,
        `كلمة المرور المؤقتة: ${input.tempPassword}`,
        `سجّل الدخول ثم غيّر كلمة المرور فوراً من صفحة المستخدمين.`,
      ].join("\n"),
    });
    return true;
  } catch (err) {
    console.error("[email] failed to send owner credentials:", err);
    return false;
  }
}
