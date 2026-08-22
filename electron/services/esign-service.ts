/**
 * HTTP client for the hosted Legion signing service. Main-process only: the
 * API key rides in the Authorization header and never appears in an error,
 * a log, or anything the renderer can see — every failure is rewritten into
 * a plain-English sentence before it leaves this file.
 */

import type { EsignEnvelopeStatus, EsignField, EsignReceipt, EsignSigner } from '@shared/types';
import type { EsignServiceCredentials } from './esign-settings';

/** Envelope creation uploads the whole PDF; a status poll is a tiny GET. */
export const CREATE_TIMEOUT_MS = 60_000;
export const STATUS_TIMEOUT_MS = 15_000;

const UNREACHABLE =
  'Could not reach the Legion signing service — check the service settings and your connection.';
const UNREADABLE_ANSWER = 'The signing service sent back an answer this app could not read.';

/** The POST /api/envelopes body — the wire shape the service expects. */
export interface EsignEnvelopePayload {
  title: string;
  message: string;
  requester: { name: string; email: string };
  signers: EsignSigner[];
  fields: EsignField[];
  pdfBase64: string;
  sendEmails: boolean;
}

async function refusalMessage(response: Response): Promise<string> {
  const fallback = `The signing service refused the request (HTTP ${response.status}).`;
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim().length > 0
      ? `The signing service refused the request: ${body.error}`
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Count verification on the way in: a receipt that lost a signer's link would
 * quietly strand that signer, so an incomplete answer is refused outright.
 */
function assertReceiptComplete(receipt: EsignReceipt, signersSent: number): void {
  if (typeof receipt.envelopeId !== 'string' || receipt.envelopeId.length === 0) {
    throw new Error(
      'The signing service answered without an envelope id — the request was not accepted.'
    );
  }
  const links = Array.isArray(receipt.signers) ? receipt.signers.length : 0;
  if (links !== signersSent) {
    throw new Error(
      `The signing service returned ${links} signing links but ${signersSent} signers were ` +
        'sent — refusing the incomplete receipt.'
    );
  }
}

export class EsignServiceClient {
  constructor(private readonly credentials: EsignServiceCredentials) {}

  async createEnvelope(payload: EsignEnvelopePayload): Promise<EsignReceipt> {
    const receipt = await this.request<EsignReceipt>(
      'POST',
      '/api/envelopes',
      payload,
      CREATE_TIMEOUT_MS
    );
    assertReceiptComplete(receipt, payload.signers.length);
    return receipt;
  }

  status(envelopeId: string): Promise<EsignEnvelopeStatus> {
    return this.request<EsignEnvelopeStatus>(
      'GET',
      `/api/envelopes/${encodeURIComponent(envelopeId)}`,
      undefined,
      STATUS_TIMEOUT_MS
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: object | undefined,
    timeoutMs: number
  ): Promise<T> {
    const response = await this.send(method, path, body, timeoutMs);
    if (!response.ok) throw new Error(await refusalMessage(response));
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error(UNREADABLE_ANSWER);
    }
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body: object | undefined,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.credentials.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.credentials.apiKey}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch {
      // The cause is dropped deliberately: fetch errors can quote request
      // internals, and one plain sentence covers both timeout and no-route.
      throw new Error(UNREACHABLE);
    } finally {
      clearTimeout(timer);
    }
  }
}
