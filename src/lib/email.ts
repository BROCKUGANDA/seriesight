/**
 * Transactional email delivery via Resend.
 *
 * The endpoint is fixed to api.resend.com: no user-controlled URLs are accepted.
 * Credentials are read only from the server environment. When the service is
 * not configured, development logs a delivery stub; production fails loudly so
 * account recovery is never silently broken.
 */
import { randomUUID } from "node:crypto";
import { AppError } from "@/domain/errors";
import { logEvent } from "@/lib/observability";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  purpose: "verify_email" | "reset_password";
  devToken?: string;
}

const TIMEOUT_MS = 8_000;

export async function deliverTransactionalEmail(input: TransactionalEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  const replyTo = process.env.EMAIL_REPLY_TO;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Email delivery is not configured on this server.",
        retryable: false,
        recovery: "Configure RESEND_API_KEY and EMAIL_FROM_ADDRESS.",
      });
    }
    logEvent("info", "email_dev_stub", {
      to: input.to,
      subject: input.subject,
      purpose: input.purpose,
      devToken: input.devToken ?? null,
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `${input.purpose}:${input.to}:${input.devToken ?? randomUUID()}`,
      },
      body: JSON.stringify({
        from: `Seriesight <${from}>`,
        to: [input.to],
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        subject: input.subject,
        text: input.text,
        html: input.html ?? `<p>${input.text.replace(/\n/g, "<br>")}</p>`,
      }),
      signal: controller.signal,
    });
    const result = await response.json() as { id?: string; message?: string; name?: string };
    if (!response.ok || !result.id) {
      throw new Error(result.message || result.name || `Email service returned ${response.status}`);
    }
    logEvent("info", "email_delivered", { to: input.to, purpose: input.purpose });
  } catch (error) {
    logEvent("error", "email_delivery_failed", {
      to: input.to,
      purpose: input.purpose,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError({
      code: "SERVICE_UNAVAILABLE",
      message: "The verification email could not be delivered.",
      retryable: true,
      recovery: "Retry shortly. If this persists, contact the operator.",
    });
  } finally {
    clearTimeout(timer);
  }
}
