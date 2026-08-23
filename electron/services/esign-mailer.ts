/**
 * Sends each signer their private signing link from the attorney's OWN
 * mailbox via the Armory's Outreach module — the 'outreach' delivery route.
 * Outreach holds the Gmail OAuth connection; this app only POSTs
 * to/subject/html plus the from-mailbox to its raw-send endpoint
 * (/service/send-founder-email — a generic service-token send despite the
 * name) over the private tailnet. Message building is a pure exported
 * function so the layout unit-tests with no network; every transport failure
 * is rewritten into plain English, and the service token never appears in an
 * error or a log. The text/plain part is built but not yet sent — Outreach's
 * MIME builder is HTML-only today.
 */

import type { EsignEmailRequest, EsignEmailResult, EsignSignerLink } from '@shared/types';
import type { EsignMailCredentials } from './esign-settings';

/** Legion's dark maroon — the one brand note in an otherwise plain email. */
const BUTTON_COLOR = '#61003A';

export interface RequestMessage {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Email headers must never carry a line break the attorney pasted in. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function quotedMessageHtml(message: string): string {
  if (message.trim().length === 0) return '';
  const body = escapeHtml(message.trim()).replaceAll('\n', '<br>');
  return (
    `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${BUTTON_COLOR};` +
    `background:#FAFAFA;color:#333333;font-size:14px;line-height:1.5;">${body}</blockquote>`
  );
}

/** The whole email for ONE signer. Pure — safe to unit-test byte for byte. */
export function buildRequestMessage(
  request: EsignEmailRequest,
  recipient: EsignSignerLink
): RequestMessage {
  const title = escapeHtml(request.title);
  const url = escapeHtml(recipient.url);
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:560px;` +
    `margin:0 auto;padding:24px;">` +
    `<p style="font-size:15px;">Hello ${escapeHtml(recipient.name)},</p>` +
    `<p style="font-size:15px;">${escapeHtml(request.requesterName)} has asked you to sign ` +
    `<strong>${title}</strong>.</p>` +
    quotedMessageHtml(request.message) +
    `<p style="margin:28px 0;"><a href="${url}" style="background:${BUTTON_COLOR};` +
    `color:#FFFFFF;padding:12px 24px;border-radius:4px;text-decoration:none;` +
    `font-weight:bold;display:inline-block;">Review &amp; sign</a></p>` +
    `<p style="font-size:13px;color:#555555;">If the button does not work, copy this link ` +
    `into your browser:<br><a href="${url}" style="color:${BUTTON_COLOR};">${url}</a></p>` +
    `<p style="font-size:12px;color:#888888;">This signing link is personal to you — ` +
    `please do not forward it.</p></div>`;
  const note = request.message.trim().length === 0 ? '' : `${request.message.trim()}\n\n`;
  const text =
    `Hello ${recipient.name},\n\n` +
    `${request.requesterName} has asked you to sign "${request.title}".\n\n` +
    note +
    `Sign here: ${recipient.url}\n\n` +
    'This signing link is personal to you — please do not forward it.\n';
  return { subject: headerSafe(`Signature requested: ${request.title}`), html, text };
}

const SEND_TIMEOUT_MS = 30_000;

/** What one send attempt came back as — everything plainFailure needs. */
interface SendOutcome {
  ok: boolean;
  status: number;
  /** True when the reply was HTML — the Armory login page, not Outreach. */
  htmlBody: boolean;
}

async function postSend(
  credentials: EsignMailCredentials,
  body: { to: string; subject: string; html: string; from: string },
  fetchImpl: typeof fetch
): Promise<SendOutcome> {
  const response = await fetchImpl(`${credentials.baseUrl}/service/send-founder-email`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type') ?? '';
  return {
    ok: response.ok && contentType.includes('application/json'),
    status: response.status,
    htmlBody: contentType.includes('text/html'),
  };
}

/** Plain English only — nothing here may quote the token or a raw body. */
function plainSendFailure(outcome: SendOutcome, sent: number, total: number): string {
  const progress = sent > 0 ? ` ${sent} of the ${total} request emails had already been sent.` : '';
  if (outcome.htmlBody || outcome.status >= 300) {
    if (outcome.status === 401 || outcome.status === 403) {
      return `The Armory rejected the service token — check the E-Sign settings.${progress}`;
    }
    if (outcome.status === 503) {
      return `Your mailbox is not connected in Outreach — connect it there, then try again.${progress}`;
    }
    if (outcome.htmlBody || (outcome.status >= 300 && outcome.status < 400)) {
      return (
        'The Armory answered with its sign-in page instead of Outreach — its ' +
        `send path has not been opened yet (see the E-Sign handoff notes).${progress}`
      );
    }
  }
  return `Sending the request emails through Outreach failed.${progress}`;
}

function plainNetworkFailure(sent: number, total: number): string {
  const progress = sent > 0 ? ` ${sent} of the ${total} request emails had already been sent.` : '';
  return `Could not reach the Armory — check that Tailscale is running on this computer.${progress}`;
}

/**
 * One email per recipient, sent as the attorney's own mailbox through
 * Outreach. All-or-loud: a failure mid-run reports how many emails already
 * left, never a quiet partial success. `fetchImpl` exists for tests only.
 */
export async function sendRequestEmails(
  request: EsignEmailRequest,
  credentials: EsignMailCredentials,
  fetchImpl: typeof fetch = fetch
): Promise<EsignEmailResult> {
  if (request.recipients.length === 0) {
    throw new Error('There is nobody to email — the request has no signing links.');
  }
  let sent = 0;
  for (const recipient of request.recipients) {
    const message = buildRequestMessage(request, recipient);
    let outcome: SendOutcome;
    try {
      outcome = await postSend(
        credentials,
        {
          to: recipient.email,
          subject: message.subject,
          html: message.html,
          from: credentials.from,
        },
        fetchImpl
      );
    } catch (error) {
      // The cause stays main-side for debugging; Electron drops it at the IPC
      // boundary, so only the plain sentence can ever reach the renderer.
      throw new Error(plainNetworkFailure(sent, request.recipients.length), { cause: error });
    }
    if (!outcome.ok) {
      throw new Error(plainSendFailure(outcome, sent, request.recipients.length));
    }
    sent += 1;
  }
  return { sent };
}
