import { describe, expect, it, vi } from 'vitest';
import type { EsignField, EsignReceipt, EsignRequestOptions, EsignSigner } from '@shared/types';
import type { EsignBridge } from '@shared/bridge';
import { isValidEmail, sendRequest, validateRequest, type SendDraft } from './send-actions';

function signer(id: string, name: string, email: string): EsignSigner {
  return { id, name, email };
}

function field(id: string, signerId: string): EsignField {
  return {
    id,
    kind: 'signature',
    signerId,
    page: 1,
    rect: { x: 10, y: 20, width: 180, height: 40 },
    required: true,
  };
}

function draft(overrides: Partial<SendDraft> = {}): SendDraft {
  return {
    title: 'Engagement Letter',
    message: 'Please sign where indicated.',
    requesterName: 'Alex Attorney',
    requesterEmail: 'alex@example.com',
    delivery: 'service',
    signers: [signer('s-1', 'Pat Morgan', 'pat@example.com')],
    fields: [field('f-1', 's-1')],
    ...overrides,
  };
}

function sampleReceipt(): EsignReceipt {
  return {
    envelopeId: 'env-1',
    title: 'Engagement Letter',
    signers: [
      { id: 's-1', name: 'Pat Morgan', email: 'pat@example.com', url: 'https://sign.example/t1' },
    ],
    expiresAt: '2026-09-22T00:00:00.000Z',
    emailed: true,
  };
}

function fakeBridge(): EsignBridge {
  return {
    createRequest: vi.fn(async () => sampleReceipt()),
    emailRequests: vi.fn(async () => ({ sent: 1 })),
    status: vi.fn(async () => ({
      envelopeId: 'env-1',
      title: 'Engagement Letter',
      status: 'pending' as const,
      signers: [],
      completedAt: null,
    })),
    exportFillable: vi.fn(async () => null),
    serviceStatus: vi.fn(async () => ({ configured: true, baseUrl: 'https://sign.example' })),
    setService: vi.fn(async () => ({ configured: true, baseUrl: 'https://sign.example' })),
    clearService: vi.fn(async () => ({ configured: false, baseUrl: '' })),
    mailStatus: vi.fn(async () => ({ configured: false, baseUrl: '', from: '' })),
    setMail: vi.fn(async () => ({
      configured: true,
      baseUrl: 'http://a',
      from: 'alex@example.com',
    })),
    clearMail: vi.fn(async () => ({ configured: false, baseUrl: '', from: '' })),
  };
}

describe('isValidEmail', () => {
  it('accepts an ordinary address and rejects the malformed', () => {
    expect(isValidEmail('pat@example.com')).toBe(true);
    expect(isValidEmail(' pat@example.com ')).toBe(true);
    expect(isValidEmail('pat@example')).toBe(false);
    expect(isValidEmail('pat example@x.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('validateRequest — the exact plain-English messages', () => {
  it('wants a title', () => {
    expect(validateRequest(draft({ title: '  ' }))).toBe(
      'Give the request a title so signers know what they are signing.'
    );
  });

  it('wants the requester’s name', () => {
    expect(validateRequest(draft({ requesterName: '' }))).toBe(
      'Add your name so signers know who is asking.'
    );
  });

  it('wants a real requester email', () => {
    expect(validateRequest(draft({ requesterEmail: 'not-an-email' }))).toBe(
      'Add your email address so signers can reach you with questions.'
    );
  });

  it('wants at least one signer', () => {
    expect(validateRequest(draft({ signers: [], fields: [] }))).toBe(
      'Add at least one signer before sending.'
    );
  });

  it('wants every signer named', () => {
    expect(validateRequest(draft({ signers: [signer('s-1', '  ', 'pat@example.com')] }))).toBe(
      'Every signer needs a name.'
    );
  });

  it('names the signer whose email is bad', () => {
    expect(validateRequest(draft({ signers: [signer('s-1', 'Pat Morgan', 'pat@nowhere')] }))).toBe(
      'Pat Morgan needs a valid email address.'
    );
  });

  it('wants at least one field placed', () => {
    expect(validateRequest(draft({ fields: [] }))).toBe(
      'Place at least one field on the document before sending.'
    );
  });

  it('names the signer who has nothing to sign', () => {
    const two = [
      signer('s-1', 'Pat Morgan', 'pat@example.com'),
      signer('s-2', 'Sam Reyes', 'sam@example.com'),
    ];
    expect(validateRequest(draft({ signers: two }))).toBe(
      'Sam Reyes has nothing to sign yet. Place at least one field for them, or remove them.'
    );
  });

  it('passes a complete draft', () => {
    expect(validateRequest(draft())).toBeNull();
  });
});

describe('sendRequest', () => {
  it('stops at validation and never touches the bridge', async () => {
    const bridge = fakeBridge();
    const record = vi.fn();

    const outcome = await sendRequest('doc-1', draft({ signers: [] }), { bridge, record });

    expect(outcome).toEqual({ ok: false, error: 'Add at least one signer before sending.' });
    expect(bridge.createRequest).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('creates, records, and skips email for service delivery — in that order', async () => {
    const calls: string[] = [];
    const bridge = fakeBridge();
    bridge.createRequest = vi.fn(async () => {
      calls.push('create');
      return sampleReceipt();
    });
    const record = vi.fn(() => {
      calls.push('record');
    });

    const outcome = await sendRequest('doc-1', draft(), { bridge, record });

    expect(outcome).toEqual({
      ok: true,
      receipt: sampleReceipt(),
      emailedCount: null,
      emailError: null,
    });
    expect(calls).toEqual(['create', 'record']);
    expect(record).toHaveBeenCalledWith('doc-1', sampleReceipt());
    expect(bridge.emailRequests).not.toHaveBeenCalled();
  });

  it('hands the bridge trimmed, wire-shaped options', async () => {
    const bridge = fakeBridge();
    const messy = draft({
      title: '  Engagement Letter  ',
      signers: [signer('s-1', '  Pat Morgan ', ' pat@example.com ')],
    });

    await sendRequest('doc-1', messy, { bridge, record: vi.fn() });

    const [docId, options] = vi.mocked(bridge.createRequest).mock.calls[0] as [
      string,
      EsignRequestOptions,
    ];
    expect(docId).toBe('doc-1');
    expect(options.title).toBe('Engagement Letter');
    // toEqual is exact about extra defined keys: renderer-only fields stay home.
    expect(options.signers).toEqual([signer('s-1', 'Pat Morgan', 'pat@example.com')]);
    expect(options.fields).toEqual([field('f-1', 's-1')]);
  });

  it('emails through Outreach after recording, with the receipt’s links', async () => {
    const calls: string[] = [];
    const bridge = fakeBridge();
    bridge.createRequest = vi.fn(async () => {
      calls.push('create');
      return sampleReceipt();
    });
    bridge.emailRequests = vi.fn(async () => {
      calls.push('email');
      return { sent: 1 };
    });
    const record = vi.fn(() => {
      calls.push('record');
    });

    const outcome = await sendRequest('doc-1', draft({ delivery: 'outreach' }), { bridge, record });

    expect(calls).toEqual(['create', 'record', 'email']);
    expect(bridge.emailRequests).toHaveBeenCalledWith({
      title: 'Engagement Letter',
      message: 'Please sign where indicated.',
      requesterName: 'Alex Attorney',
      recipients: sampleReceipt().signers,
    });
    expect(outcome).toMatchObject({ ok: true, emailedCount: 1, emailError: null });
  });

  it('sends no emails for links delivery', async () => {
    const bridge = fakeBridge();

    const outcome = await sendRequest('doc-1', draft({ delivery: 'links' }), {
      bridge,
      record: vi.fn(),
    });

    expect(bridge.emailRequests).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, emailedCount: null });
  });

  it('reports a failed create plainly and records nothing', async () => {
    const bridge = fakeBridge();
    bridge.createRequest = vi.fn(async () => {
      throw new Error("Error invoking remote method 'esign:create-request': The service said no.");
    });
    const record = vi.fn();

    const outcome = await sendRequest('doc-1', draft(), { bridge, record });

    expect(outcome).toEqual({
      ok: false,
      error: 'The request could not be sent: The service said no.',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('keeps the envelope when the Outreach send fails, and says both things', async () => {
    const bridge = fakeBridge();
    bridge.emailRequests = vi.fn(async () => {
      throw new Error('The app password was rejected.');
    });
    const record = vi.fn();

    const outcome = await sendRequest('doc-1', draft({ delivery: 'outreach' }), { bridge, record });

    expect(record).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.emailedCount).toBeNull();
      expect(outcome.emailError).toContain('The request was created');
      expect(outcome.emailError).toContain('The app password was rejected.');
    }
  });
});
