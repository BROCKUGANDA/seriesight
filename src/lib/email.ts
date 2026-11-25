/**
 * Transactional email delivery via Cloudflare Email Service REST API.
 *
 * The endpoint is fixed to api.cloudflare.com: no user-controlled URLs are
 * accepted. Credentials are read only from the server environment. When the
 * service is not configured, development logs a delivery stub; production
 * fails loudly so account recovery is never silently broken.
 */
import { createHmac } from "node:crypto";
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

function config() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
    from: process.env.EMAIL_FROM_ADDRESS,
    replyTo: process.env.EMAIL_REPLY_TO,
  };
}

export async function deliverTransactionalEmail(input: TransactionalEmail): Promise<void> {
  const { accountId, token, from, replyTo } = config();
  if (!accountId || !token || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Email delivery is not configured on this server.",
        retryable: false,
        recovery: "Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN and EMAIL_FROM_ADDRESS.",
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
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: input.to,
          from: { address: from, name: "Seriesight" },
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: input.subject,
          text: input.text,
          html: input.html ?? `<p>${input.text.replace(/\n/g, "<br>")}</p>`,
        }),
        signal: controller.signal,
      },
    );
    const result = await response.json() as {
      success?: boolean;
      permanent_bounces?: string[];
      errors?: { message?: string }[];
    };
    if (!response.ok || result.success === false || (result.permanent_bounces?.length ?? 0) > 0) {
      throw new Error(result.errors?.map((e) => e.message).join("; ") || `Email service returned ${response.status}`);
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

/** Stable signature helper for future webhook-driven delivery providers. */
export function signEmailPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
