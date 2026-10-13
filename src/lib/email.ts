/**
 * @deprecated Canonical module is `src/lib/mail.ts`. This file re-exports for
 * backward-compatibility — new code should import from `@/lib/mail`.
 */
export {
  isMailConfigured as isEmailConfigured,
  isMailConfigured,
  sendOwnerCredentials,
  sendPlanChangeApproved,
  type MailResult,
} from "./mail";
