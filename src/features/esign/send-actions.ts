/**
 * Sending a signature request, kept out of the components: validate the draft
 * in plain English, create the envelope on the signing service, record the
 * receipt, and — when the attorney's own mailbox (via Outreach) is the courier — send the
 * request emails. Everything here takes the bridge as an argument, so it is
 * unit-testable without an Electron preload in sight.
 */

import type {
  EsignField,
  EsignDelivery,
  EsignReceipt,
  EsignRequestOptions,
  EsignSigner,
} from '@shared/types';
import type { EsignBridge } from '@shared/bridge';
// Imported directly, not through the stamps barrel: the barrel drags the panel
// React tree (and pdfjs, through the viewer) into this pure module and its tests.
import { describeError } from '@renderer/features/stamps/use-stamp-runner';
import { useEsignStore } from './request-store';

/** Everything the Send section has gathered, exactly as typed. */
export interface SendDraft {
  title: string;
  message: string;
  requesterName: string;
  requesterEmail: string;
  delivery: EsignDelivery;
  signers: EsignSigner[];
  fields: EsignField[];
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

function requesterProblem(draft: SendDraft): string | null {
  if (draft.title.trim() === '') {
    return 'Give the request a title so signers know what they are signing.';
  }
  if (draft.requesterName.trim() === '') return 'Add your name so signers know who is asking.';
  if (!isValidEmail(draft.requesterEmail)) {
    return 'Add your email address so signers can reach you with questions.';
  }
  return null;
}

function signerProblem(signers: readonly EsignSigner[]): string | null {
  if (signers.length === 0) return 'Add at least one signer before sending.';
  for (const signer of signers) {
    if (signer.name.trim() === '') return 'Every signer needs a name.';
    if (!isValidEmail(signer.email)) {
      return `${signer.name.trim()} needs a valid email address.`;
    }
  }
  return null;
}

function fieldProblem(signers: readonly EsignSigner[], fields: readonly EsignField[]) {
  if (fields.length === 0) return 'Place at least one field on the document before sending.';
  for (const signer of signers) {
    if (!fields.some((field) => field.signerId === signer.id)) {
      return `${signer.name.trim()} has nothing to sign yet. Place at least one field for them, or remove them.`;
    }
  }
  return null;
}

/** The first thing wrong with the draft, in plain English — or null when good. */
export function validateRequest(draft: SendDraft): string | null {
  return (
    requesterProblem(draft) ??
    signerProblem(draft.signers) ??
    fieldProblem(draft.signers, draft.fields)
  );
}

/** Signers stripped to the wire shape — no renderer-only fields go out. */
export function plainSigners(signers: readonly EsignSigner[]): EsignSigner[] {
  return signers.map(({ id, name, email }) => ({ id, name: name.trim(), email: email.trim() }));
}

/** Fields stripped to the wire shape. */
export function plainFields(fields: readonly EsignField[]): EsignField[] {
  return fields.map(({ id, kind, signerId, page, rect, label, required }) => ({
    id,
    kind,
    signerId,
    page,
    rect,
    label,
    required,
  }));
}

function requestOptions(draft: SendDraft): EsignRequestOptions {
  return {
    title: draft.title.trim(),
    message: draft.message.trim(),
    requesterName: draft.requesterName.trim(),
    requesterEmail: draft.requesterEmail.trim(),
    signers: plainSigners(draft.signers),
    fields: plainFields(draft.fields),
    delivery: draft.delivery,
  };
}

export interface SendSuccess {
  ok: true;
  receipt: EsignReceipt;
  /** Emails that left the attorney's own mailbox; null when it was not the courier. */
  emailedCount: number | null;
  /** Set when the envelope was created but the Outreach send then failed. */
  emailError: string | null;
}

export interface SendFailure {
  ok: false;
  error: string;
}

export type SendOutcome = SendSuccess | SendFailure;

export interface SendDeps {
  bridge: EsignBridge;
  record(docId: string, receipt: EsignReceipt): void;
}

function defaultDeps(): SendDeps {
  return {
    bridge: window.librarius.esign,
    record: (docId, receipt) => useEsignStore.getState().recordSent(docId, receipt),
  };
}

async function emailFromOutreach(
  draft: SendDraft,
  receipt: EsignReceipt,
  bridge: EsignBridge
): Promise<SendSuccess> {
  try {
    const result = await bridge.emailRequests({
      title: receipt.title,
      message: draft.message.trim(),
      requesterName: draft.requesterName.trim(),
      recipients: receipt.signers,
    });
    return { ok: true, receipt, emailedCount: result.sent, emailError: null };
  } catch (error) {
    const detail = describeError(error);
    return {
      ok: true,
      receipt,
      emailedCount: null,
      emailError: `The request was created, but the emails could not be sent from your mailbox: ${detail} You can copy each signer's link from the request below.`,
    };
  }
}

/**
 * Validate, create, record, then (for Outreach delivery) email — in that order.
 * Never throws: every path comes back as a SendOutcome the panel can show.
 */
export async function sendRequest(
  docId: string,
  draft: SendDraft,
  deps: SendDeps = defaultDeps()
): Promise<SendOutcome> {
  const problem = validateRequest(draft);
  if (problem !== null) return { ok: false, error: problem };

  let receipt: EsignReceipt;
  try {
    receipt = await deps.bridge.createRequest(docId, requestOptions(draft));
  } catch (error) {
    return { ok: false, error: `The request could not be sent: ${describeError(error)}` };
  }
  deps.record(docId, receipt);

  if (draft.delivery !== 'outreach') {
    return { ok: true, receipt, emailedCount: null, emailError: null };
  }
  return emailFromOutreach(draft, receipt, deps.bridge);
}
