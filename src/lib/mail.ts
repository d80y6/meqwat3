import nodemailer from "nodemailer";

/**
 * Transactional email via SMTP (nodemailer) — canonical mail module.
 *
 * This is the SINGLE source of truth for email delivery in Meqwat.
 * `src/lib/email.ts` re-exports from here for backward-compat.
 *
 * Configuration (environment):
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
 *   SMTP_FROM (default: SMTP_USER), SMTP_SECURE ("true" for port 465)
 *
 * When SMTP is not configured the mailer reports { sent: false, via: "log-only" }
 * instead of throwing — account provisioning must never fail because email is down.
 * The platform admin still receives the one-time credentials in the UI and
 * can hand them over manually.
 */

export interface MailResult {
  sent: boolean;
  /** "log-only" when SMTP not configured, "smtp" on success, "error" on failure. */
  via: "smtp" | "log-only" | "error";
  reason?: string;
}

function transporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Backward-compat alias used by older imports & tests. */
export const isEmailConfigured = isMailConfigured;

async function send(to: string, subject: string, text: string, html?: string): Promise<MailResult> {
  const tx = transporter();
  if (!tx) {
    console.log(`[mail] SMTP not configured — would send to ${to}: ${subject}`);
    return { sent: false, via: "log-only", reason: "SMTP_NOT_CONFIGURED" };
  }
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "no-reply@meqwat.app",
      to,
      subject,
      text,
      html,
    });
    return { sent: true, via: "smtp" };
  } catch (err) {
    console.error("[mail] send failed:", err instanceof Error ? err.message : err);
    return { sent: false, via: "error", reason: "SMTP_SEND_FAILED" };
  }
}

/** Welcome email with one-time credentials for a newly provisioned owner. */
export async function sendOwnerCredentials(input: {
  to: string;
  ownerName?: string;
  tenantName: string;
  tempPassword: string;
  planName?: string;
}): Promise<MailResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.meqwat.example";
  const displayName = input.ownerName ?? "مالك المتجر";
  const planLine = input.planName ? `الباقة: ${input.planName}\n` : "";
  return send(
    input.to,
    `بيانات دخول متجرك في منصة مقوات — ${input.tenantName}`,
    [
      `مرحباً ${displayName}،`,
      ``,
      `تم إنشاء متجر «${input.tenantName}» في منصة مقوات.`,
      planLine ? planLine.trim() : "",
      `رابط الدخول: ${appUrl}/login`,
      `البريد: ${input.to}`,
      `كلمة المرور المؤقتة: ${input.tempPassword}`,
      ``,
      `مهم: غيّر كلمة المرور فور أول دخول من صفحة المستخدمين.`,
      `فريق منصة مقوات`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

/** Notify an existing tenant owner that their plan change was approved. */
export async function sendPlanChangeApproved(input: {
  to: string;
  tenantName: string;
  planName: string;
  endsAt: Date;
}): Promise<MailResult> {
  return send(
    input.to,
    `تمت الموافقة على طلب اشتراك متجر ${input.tenantName}`,
    [
      `تمت الموافقة على طلب تغيير/تجديد اشتراك متجر «${input.tenantName}».`,
      `الباقة الحالية: ${input.planName}`,
      `ساري حتى: ${input.endsAt.toLocaleDateString("ar-YE")}`,
      `فريق منصة مقوات`,
    ].join("\n"),
  );
}

/** Generic notification — used for future ops alerts. */
export async function sendNotification(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<MailResult> {
  return send(input.to, input.subject, input.body);
}
