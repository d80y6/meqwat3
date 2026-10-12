import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email. Real SMTP when configured via environment:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Without SMTP configuration NO email is sent (we never fake delivery):
 * the message is rendered to the server log for local development and the
 * caller is told delivery did not happen so credentials can be handed over
 * manually by the platform admin.
 */
let transporter: Transporter | null = null;
let smtpConfigured: boolean | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  smtpConfigured = Boolean(host);
  transporter = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

export interface EmailResult {
  /** true only when a real SMTP server accepted the message. */
  sent: boolean;
  via: "smtp" | "log-only" | "error";
  error?: string;
}

export async function sendOwnerCredentials(input: {
  to: string;
  ownerName: string;
  tenantName: string;
  tempPassword: string;
}): Promise<EmailResult> {
  const from = process.env.SMTP_FROM ?? "منصة مقوات <no-reply@meqwat.app>";
  const subject = `بيانات دخول متجرك على منصة مقوات — ${input.tenantName}`;
  const text = [
    `مرحباً ${input.ownerName}،`,
    ``,
    `تم تفعيل متجرك «${input.tenantName}» على منصة مقوات لإدارة متاجر القات.`,
    `بيانات الدخول:`,
    `  البريد الإلكتروني: ${input.to}`,
    `  كلمة المرور المؤقتة: ${input.tempPassword}`,
    ``,
    `سجّل الدخول ثم غيّر كلمة المرور فوراً من صفحة المستخدمين.`,
    `— فريق منصة مقوات`,
  ].join("\n");

  try {
    const info = await getTransporter().sendMail({ from, to: input.to, subject, text });
    if (smtpConfigured) {
      return { sent: true, via: "smtp" };
    }
    // jsonTransport (dev): rendered but NOT delivered.
    console.info(`[email:log-only] to=${input.to} subject="${subject}" messageId=${info.messageId}`);
    return { sent: false, via: "log-only" };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { sent: false, via: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}
