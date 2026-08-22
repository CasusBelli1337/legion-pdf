/**
 * Sends each signer their private signing link from the attorney's OWN Gmail
 * (smtp.gmail.com over SSL, app-password auth) — the 'gmail' delivery route.
 * Message building is a pure exported function so the layout unit-tests with
 * no network; every transport failure is rewritten into plain English, and
 * the app password never appears in an error or a log.
 */

import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
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

function gmailTransport(credentials: EsignMailCredentials): Transporter {
  return createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: credentials.address, pass: credentials.appPassword },
  });
}

/** Plain English only — the raw SMTP error can name hosts, never leaves main. */
function plainMailFailure(error: unknown, sent: number, total: number): string {
  const progress = sent > 0 ? ` ${sent} of the ${total} request emails had already been sent.` : '';
  const code = (error as { code?: unknown }).code;
  if (code === 'EAUTH') {
    return `Gmail rejected the sender sign-in — check the app password.${progress}`;
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'EDNS' || code === 'ESOCKET') {
    return `Could not reach Gmail — check your internet connection.${progress}`;
  }
  return `Sending the request emails through Gmail failed.${progress}`;
}

/**
 * One email per recipient, from the attorney's address. All-or-loud: a
 * failure mid-run reports how many emails already left, never a quiet
 * partial success. The transport parameter exists for tests only.
 */
export async function sendRequestEmails(
  request: EsignEmailRequest,
  credentials: EsignMailCredentials,
  transport: Transporter = gmailTransport(credentials)
): Promise<EsignEmailResult> {
  if (request.recipients.length === 0) {
    throw new Error('There is nobody to email — the request has no signing links.');
  }
  let sent = 0;
  try {
    for (const recipient of request.recipients) {
      const message = buildRequestMessage(request, recipient);
      await transport.sendMail({
        from: { name: headerSafe(request.requesterName), address: credentials.address },
        to: { name: headerSafe(recipient.name), address: recipient.email },
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      sent += 1;
    }
  } catch (error) {
    // The cause stays main-side for debugging; Electron drops it at the IPC
    // boundary, so only the plain sentence can ever reach the renderer.
    throw new Error(plainMailFailure(error, sent, request.recipients.length), { cause: error });
  } finally {
    transport.close();
  }
  return { sent };
}
