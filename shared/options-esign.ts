/**
 * E-signature request shapes shared by all zones: the fields an attorney
 * places on a document, the signers they belong to, and the wire contract
 * with the Legion signing service (legionarmory.net) plus the request-email
 * sender. Types only — re-exported type-only from @shared/types.
 *
 * The fields here are REQUEST metadata, never document content: nothing is
 * burned into the local bytes. The hosted service burns values at completion;
 * "export fillable" writes a fresh copy with real AcroForm fields for
 * recipients using Acrobat or any other viewer.
 */

import type { PdfRect } from './types';

/* ── the request being assembled in the panel ─────────────────────────── */

/** What the signer is asked to put in the box. */
export type EsignFieldKind = 'signature' | 'initials' | 'name' | 'date' | 'text';

/** One person asked to sign. `id` is app-local and stable for the session. */
export interface EsignSigner {
  id: string;
  name: string;
  email: string;
}

/** One box placed on a page, owned by one signer. */
export interface EsignField {
  id: string;
  kind: EsignFieldKind;
  signerId: string;
  /** 1-based page number. */
  page: number;
  /** PDF user space, bottom-left anchored. */
  rect: PdfRect;
  /** Prompt shown to the signer for a 'text' field, e.g. "Title". */
  label?: string;
  required: boolean;
}

/* ── wire contract with the signing service ───────────────────────────── */

/**
 * Who emails the signers their links: the signing service (from
 * sign@legion.law), the attorney's own mailbox via the Armory's Outreach
 * module, or nobody — the attorney copies the links into whatever channel
 * they like.
 */
export type EsignDelivery = 'service' | 'outreach' | 'links';

export interface EsignRequestOptions {
  /** Shown to signers and used as the email subject, e.g. the document name. */
  title: string;
  /** The attorney's covering note, shown on the signing page and email. */
  message: string;
  requesterName: string;
  requesterEmail: string;
  signers: EsignSigner[];
  fields: EsignField[];
  delivery: EsignDelivery;
}

/** One signer's private link. The URL embeds their capability token. */
export interface EsignSignerLink {
  id: string;
  name: string;
  email: string;
  url: string;
}

/** What the service hands back when an envelope is created. */
export interface EsignReceipt {
  envelopeId: string;
  title: string;
  signers: EsignSignerLink[];
  /** ISO 8601: links stop working after this. */
  expiresAt: string;
  /** True when the service itself emailed the links to the signers. */
  emailed: boolean;
}

/** Live signing progress, polled by the panel via the requester API. */
export interface EsignSignerStatus {
  name: string;
  email: string;
  /** ISO 8601 when they finished, null while pending. */
  signedAt: string | null;
}

export interface EsignEnvelopeStatus {
  envelopeId: string;
  title: string;
  status: 'pending' | 'complete';
  signers: EsignSignerStatus[];
  completedAt: string | null;
}

/* ── settings: the service connection and the request-email sender ────── */

/** Renderer-visible service state. The API key itself never leaves main. */
export interface EsignServiceStatus {
  configured: boolean;
  baseUrl: string;
}

/** Renderer-visible Outreach sender state. The service token never leaves main. */
export interface EsignMailStatus {
  configured: boolean;
  /** The Outreach module's base URL (Armory over Tailscale). */
  baseUrl: string;
  /** The mailbox requests are sent from, e.g. arthur@legion.law. */
  from: string;
}

/* ── sending the request emails ───────────────────────────────────────── */

export interface EsignEmailRequest {
  title: string;
  message: string;
  requesterName: string;
  recipients: EsignSignerLink[];
}

export interface EsignEmailResult {
  /** How many request emails actually left the outbox. */
  sent: number;
}

/* ── export fallback: a fillable PDF any viewer can complete ──────────── */

export interface FillableFormOptions {
  signers: EsignSigner[];
  fields: EsignField[];
}

export interface FillableFormDetail {
  /** Real AcroForm fields created (name, date, text, initials). */
  fieldsCreated: number;
  /** Signature guide boxes drawn as page content for Fill & Sign. */
  guidesDrawn: number;
}
