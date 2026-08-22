import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EsignReceipt } from '@shared/types';
import { EsignServiceClient } from './esign-service';
import type { EsignEnvelopePayload } from './esign-service';

const CREDENTIALS = { baseUrl: 'https://sign.example.net', apiKey: 'lsk-secret-0123456789' };

const PAYLOAD: EsignEnvelopePayload = {
  title: 'Settlement Agreement',
  message: 'Please sign by Friday.',
  requester: { name: 'Alex Prentiss', email: 'alex.prentiss@example.com' },
  signers: [
    { id: 's1', name: 'Maria Vance', email: 'maria.vance@example.com' },
    { id: 's2', name: 'Declan Ruiz', email: 'declan.ruiz@example.com' },
  ],
  fields: [
    {
      id: 'f1',
      kind: 'signature',
      signerId: 's1',
      page: 1,
      rect: { x: 72, y: 500, width: 220, height: 50 },
      required: true,
    },
  ],
  pdfBase64: 'JVBERi0=',
  sendEmails: true,
};

const RECEIPT: EsignReceipt = {
  envelopeId: 'env-123',
  title: 'Settlement Agreement',
  signers: [
    { id: 's1', name: 'Maria Vance', email: 'maria.vance@example.com', url: 'https://s/1' },
    { id: 's2', name: 'Declan Ruiz', email: 'declan.ruiz@example.com', url: 'https://s/2' },
  ],
  expiresAt: '2026-09-22T00:00:00.000Z',
  emailed: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('EsignServiceClient.createEnvelope', () => {
  it('POSTs the payload with the bearer key and resolves with the receipt', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(RECEIPT));
    vi.stubGlobal('fetch', fetchMock);

    const receipt = await new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD);

    expect(receipt).toEqual(RECEIPT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sign.example.net/api/envelopes');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      authorization: `Bearer ${CREDENTIALS.apiKey}`,
      'content-type': 'application/json',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);
  });

  it('refuses a receipt that is missing a signing link', async () => {
    const incomplete = { ...RECEIPT, signers: RECEIPT.signers.slice(0, 1) };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(incomplete))
    );

    await expect(new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD)).rejects.toThrow(
      /returned 1 signing links but 2 signers were sent/
    );
  });

  it('refuses a receipt with no envelope id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ...RECEIPT, envelopeId: '' }))
    );

    await expect(new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD)).rejects.toThrow(
      /answered without an envelope id/
    );
  });

  it("relays the service's own {error} sentence on a refusal", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'envelope limit reached' }, 422))
    );

    await expect(new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD)).rejects.toThrow(
      'The signing service refused the request: envelope limit reached'
    );
  });

  it('falls back to the HTTP status when the refusal body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 }))
    );

    await expect(new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD)).rejects.toThrow(
      'The signing service refused the request (HTTP 502).'
    );
  });

  it('maps a network failure to plain English and never quotes the API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError(`fetch failed: key ${CREDENTIALS.apiKey} rejected`);
      })
    );

    let thrown: unknown;
    try {
      await new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe(
      'Could not reach the Legion signing service — check the service settings and your connection.'
    );
    expect((thrown as Error).message).not.toContain(CREDENTIALS.apiKey);
  });

  it('rejects an unreadable 2xx answer instead of parsing garbage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 200 }))
    );

    await expect(new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD)).rejects.toThrow(
      'The signing service sent back an answer this app could not read.'
    );
  });

  it('aborts after the 60-second create budget, not the 15-second status one', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const settled = vi.fn();
    const promise = new EsignServiceClient(CREDENTIALS).createEnvelope(PAYLOAD);
    promise.then(settled, settled);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(promise).rejects.toThrow(/Could not reach the Legion signing service/);
  });
});

describe('EsignServiceClient.status', () => {
  it('GETs the envelope by id with the bearer key', async () => {
    const status = {
      envelopeId: 'env-123',
      title: 'Settlement Agreement',
      status: 'pending',
      signers: [{ name: 'Maria Vance', email: 'maria.vance@example.com', signedAt: null }],
      completedAt: null,
    };
    const fetchMock = vi.fn(async () => jsonResponse(status));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new EsignServiceClient(CREDENTIALS).status('env 123/x')).resolves.toEqual(status);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sign.example.net/api/envelopes/env%20123%2Fx');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${CREDENTIALS.apiKey}`
    );
  });

  it('aborts a status poll after its 15-second budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      )
    );

    const promise = new EsignServiceClient(CREDENTIALS).status('env-123');
    const guard = expect(promise).rejects.toThrow(/Could not reach the Legion signing service/);
    await vi.advanceTimersByTimeAsync(15_000);
    await guard;
  });
});
