// #seam:ipc-contract
/**
 * LANE G (E-Sign) — every esign:* channel. Credentials live in EsignSettings
 * (safeStorage, main process only); the renderer's whole view of them is
 * `configured` plus the non-secret half. Bytes go OUT to the signing service
 * only here, and every failure crosses IPC as one plain-English sentence.
 */

import { app, dialog, ipcMain, safeStorage } from 'electron';
import type { SaveDialogOptions } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  DocumentSession,
  EsignEmailRequest,
  EsignEmailResult,
  EsignReceipt,
  EsignRequestOptions,
  FillableFormDetail,
  FillableFormOptions,
  SaveResult,
} from '@shared/types';
import { buildFillableForm } from '@core/esign';
import { writeFileAtomic } from '../services/atomic-write';
import { sendRequestEmails } from '../services/esign-mailer';
import { EsignServiceClient } from '../services/esign-service';
import type { EsignEnvelopePayload } from '../services/esign-service';
import { EsignSettings } from '../services/esign-settings';
import { assertPlacementsValid } from './esign-validate';
import type { IpcContext } from './context';

const NEEDS_SERVICE = 'Connect the Legion signing service in the E-Sign panel settings first.';
const NEEDS_MAIL = 'Set up your Gmail sender in the E-Sign panel settings first.';

export function registerEsignHandlers(context: IpcContext): void {
  const settings = new EsignSettings({ directory: app.getPath('userData'), safeStorage });
  registerRequestHandlers(context, settings);
  registerSettingsHandlers(settings);
}

/**
 * Electron flattens a thrown Error to its message across IPC. Every message
 * built in this lane is already written for an attorney; anything else (a
 * pdf-lib internal, a non-Error throw) is replaced rather than leaked.
 */
function plainError(error: unknown): Error {
  if (error instanceof Error && error.message.length > 0) return new Error(error.message);
  return new Error('Something went wrong with the e-sign request. Try again.');
}

/** Wraps a handler so every failure leaves as ONE plain-English sentence. */
function guarded<A extends unknown[], R>(
  handler: (...args: A) => R | Promise<R>
): (event: unknown, ...args: A) => Promise<R> {
  return async (_event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw plainError(error);
    }
  };
}

function requireSession(context: IpcContext, docId: string): DocumentSession {
  if (!context.store.has(docId)) {
    throw new Error('That document is no longer open.');
  }
  return context.store.session(docId);
}

function serviceClient(settings: EsignSettings): EsignServiceClient {
  const credentials = settings.serviceCredentials();
  if (credentials === null) throw new Error(NEEDS_SERVICE);
  return new EsignServiceClient(credentials);
}

function handleCreateRequest(
  context: IpcContext,
  settings: EsignSettings,
  docId: string,
  options: EsignRequestOptions
): Promise<EsignReceipt> {
  const session = requireSession(context, docId);
  assertPlacementsValid(options.signers, options.fields, session.pageCount);
  const client = serviceClient(settings);
  const payload: EsignEnvelopePayload = {
    title: options.title,
    message: options.message,
    requester: { name: options.requesterName, email: options.requesterEmail },
    signers: options.signers,
    fields: options.fields,
    pdfBase64: Buffer.from(context.store.bytes(docId)).toString('base64'),
    // The service emails the links itself only on 'service' delivery; for
    // 'gmail' and 'links' the receipt comes back with the links unsent.
    sendEmails: options.delivery === 'service',
  };
  return client.createEnvelope(payload);
}

function handleEmailRequests(
  settings: EsignSettings,
  request: EsignEmailRequest
): Promise<EsignEmailResult> {
  const credentials = settings.mailCredentials();
  if (credentials === null) throw new Error(NEEDS_MAIL);
  return sendRequestEmails(request, credentials);
}

/** The same Save As the file lane raises, aimed at the fillable copy. */
async function askFillablePath(context: IpcContext, fileName: string): Promise<string | null> {
  const window = context.getWindow();
  const options: SaveDialogOptions = {
    title: 'Export Fillable Copy',
    defaultPath: `${fileName.replace(/\.pdf$/i, '')} (fillable).pdf`,
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || result.filePath === undefined ? null : result.filePath;
}

/**
 * Validate → ask where → build → atomic write, in that order: a bad placement
 * is refused before the dialog ever opens, and a cancel costs nothing. The
 * document itself is untouched — the fillable copy is a new file on disk.
 */
async function handleExportFillable(
  context: IpcContext,
  docId: string,
  options: FillableFormOptions
): Promise<(SaveResult & { detail: FillableFormDetail }) | null> {
  const session = requireSession(context, docId);
  assertPlacementsValid(options.signers, options.fields, session.pageCount);
  const filePath = await askFillablePath(context, session.fileName);
  if (filePath === null) return null;
  const result = await buildFillableForm(context.store.bytes(docId), options);
  const byteLength = await writeFileAtomic(filePath, result.bytes);
  return { filePath, byteLength, savedAt: new Date().toISOString(), detail: result.detail };
}

function registerRequestHandlers(context: IpcContext, settings: EsignSettings): void {
  ipcMain.handle(
    IPC.esign.createRequest,
    guarded((docId: string, options: EsignRequestOptions) =>
      handleCreateRequest(context, settings, docId, options)
    )
  );

  ipcMain.handle(
    IPC.esign.emailRequests,
    guarded((request: EsignEmailRequest) => handleEmailRequests(settings, request))
  );

  ipcMain.handle(
    IPC.esign.status,
    guarded((envelopeId: string) => serviceClient(settings).status(envelopeId))
  );

  ipcMain.handle(
    IPC.esign.exportFillable,
    guarded((docId: string, options: FillableFormOptions) =>
      handleExportFillable(context, docId, options)
    )
  );
}

function registerSettingsHandlers(settings: EsignSettings): void {
  ipcMain.handle(
    IPC.esign.serviceStatus,
    guarded(() => settings.serviceStatus())
  );

  ipcMain.handle(
    IPC.esign.setService,
    guarded((baseUrl: string, apiKey: string) => {
      settings.setService(baseUrl, apiKey);
      return settings.serviceStatus();
    })
  );

  ipcMain.handle(
    IPC.esign.clearService,
    guarded(() => {
      settings.clearService();
      return settings.serviceStatus();
    })
  );

  ipcMain.handle(
    IPC.esign.mailStatus,
    guarded(() => settings.mailStatus())
  );

  ipcMain.handle(
    IPC.esign.setMail,
    guarded((address: string, appPassword: string) => {
      settings.setMail(address, appPassword);
      return settings.mailStatus();
    })
  );

  ipcMain.handle(
    IPC.esign.clearMail,
    guarded(() => {
      settings.clearMail();
      return settings.mailStatus();
    })
  );
}
