import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentSession, EsignEnvelopeStatus, EsignReceipt } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { useEsignStore } from './request-store';

function session(id: string): DocumentSession {
  return {
    id,
    filePath: `C:\\Matters\\${id}.pdf`,
    fileName: `${id}.pdf`,
    bytes: new Uint8Array([1]),
    pageCount: 10,
    dirty: false,
  };
}

function receipt(envelopeId: string): EsignReceipt {
  return {
    envelopeId,
    title: 'Settlement Agreement',
    signers: [
      { id: 's-1', name: 'Pat Morgan', email: 'pat@example.com', url: 'https://sign.example/a' },
    ],
    expiresAt: '2026-09-22T00:00:00.000Z',
    emailed: true,
  };
}

function envelopeStatus(envelopeId: string, done: boolean): EsignEnvelopeStatus {
  return {
    envelopeId,
    title: 'Settlement Agreement',
    status: done ? 'complete' : 'pending',
    signers: [
      {
        name: 'Pat Morgan',
        email: 'pat@example.com',
        signedAt: done ? '2026-08-23T12:00:00.000Z' : null,
      },
    ],
    completedAt: done ? '2026-08-23T12:00:00.000Z' : null,
  };
}

function state() {
  return useEsignStore.getState();
}

function addField(docId: string, signerId: string, page = 1): string {
  return state().addField(docId, {
    kind: 'signature',
    signerId,
    page,
    rect: { x: 10, y: 20, width: 180, height: 40 },
    required: true,
  });
}

beforeEach(() => {
  useEsignStore.setState({
    signers: [],
    fields: [],
    sent: [],
    selectedFieldId: null,
    placing: null,
  });
  useAppStore.setState({ sessions: [session('doc-1'), session('doc-2')], activeId: 'doc-1' });
});

describe('signers', () => {
  it('keeps them per document, in the order they were added', () => {
    state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    state().addSigner('doc-1', 'Sam Reyes', 'sam@example.com');
    state().addSigner('doc-2', 'Lee Chu', 'lee@example.com');
    expect(state().signers.map((signer) => signer.name)).toEqual([
      'Pat Morgan',
      'Sam Reyes',
      'Lee Chu',
    ]);
    expect(state().signers.filter((signer) => signer.docId === 'doc-1')).toHaveLength(2);
  });

  it('removing a signer removes every field that belonged to them', () => {
    const pat = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    const sam = state().addSigner('doc-1', 'Sam Reyes', 'sam@example.com');
    addField('doc-1', pat, 1);
    addField('doc-1', pat, 3);
    const kept = addField('doc-1', sam, 2);

    state().removeSigner(pat);

    expect(state().fields.map((field) => field.id)).toEqual([kept]);
    expect(state().signers.map((signer) => signer.id)).toEqual([sam]);
  });

  it('updates a signer in place', () => {
    const id = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    state().updateSigner(id, { email: 'pat.morgan@example.com' });
    expect(state().signers[0]).toMatchObject({
      name: 'Pat Morgan',
      email: 'pat.morgan@example.com',
    });
  });
});

describe('fields', () => {
  it('selects what was just placed, so it can be adjusted straight away', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    const id = addField('doc-1', signer);
    expect(state().selectedFieldId).toBe(id);
  });

  it('moves one field without disturbing the others', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    const first = addField('doc-1', signer, 1);
    addField('doc-1', signer, 2);

    state().moveField(first, { x: 99, y: 99, width: 180, height: 40 });

    expect(state().fields[0]?.rect).toEqual({ x: 99, y: 99, width: 180, height: 40 });
    expect(state().fields[1]?.rect).toEqual({ x: 10, y: 20, width: 180, height: 40 });
  });

  it('carries a label patch onto exactly one field', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    const id = addField('doc-1', signer);
    addField('doc-1', signer);

    state().updateField(id, { label: 'Title' });

    expect(state().fields[0]?.label).toBe('Title');
    expect(state().fields[1]?.label).toBeUndefined();
  });

  it('removing the selected field clears the selection; removing another leaves it', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    const first = addField('doc-1', signer);
    const second = addField('doc-1', signer);

    state().removeField(first);
    expect(state().selectedFieldId).toBe(second);

    state().removeField(second);
    expect(state().selectedFieldId).toBeNull();
  });
});

describe('sent requests', () => {
  it('records a receipt with no status until the service answers', () => {
    state().recordSent('doc-1', receipt('env-1'));
    expect(state().sent).toEqual([{ docId: 'doc-1', receipt: receipt('env-1'), status: null }]);
  });

  it('recordStatus lands on the matching envelope and no other', () => {
    state().recordSent('doc-1', receipt('env-1'));
    state().recordSent('doc-1', receipt('env-2'));

    state().recordStatus('env-2', envelopeStatus('env-2', true));

    expect(state().sent[0]?.status).toBeNull();
    expect(state().sent[1]?.status?.status).toBe('complete');
  });
});

describe('retainDocuments', () => {
  it('culls signers, fields, and sent requests of closed documents', () => {
    const gone = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    const kept = state().addSigner('doc-2', 'Lee Chu', 'lee@example.com');
    addField('doc-1', gone);
    addField('doc-2', kept);
    state().recordSent('doc-1', receipt('env-1'));
    state().recordSent('doc-2', receipt('env-2'));

    state().retainDocuments(['doc-2']);

    expect(state().signers.map((signer) => signer.id)).toEqual([kept]);
    expect(state().fields.every((field) => field.docId === 'doc-2')).toBe(true);
    expect(state().sent.map((entry) => entry.receipt.envelopeId)).toEqual(['env-2']);
  });

  it('clears a selection whose field was culled', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    addField('doc-1', signer);
    expect(state().selectedFieldId).not.toBeNull();

    state().retainDocuments(['doc-2']);
    expect(state().selectedFieldId).toBeNull();
  });

  it('returns the same state object when nothing changed', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    addField('doc-1', signer);
    const before = state().fields;

    state().retainDocuments(['doc-1', 'doc-2']);
    expect(state().fields).toBe(before);
  });

  it('runs off the session list, so closing a tab drops its request', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    addField('doc-1', signer);
    state().addSigner('doc-2', 'Lee Chu', 'lee@example.com');

    useAppStore.getState().closeSession('doc-1');

    expect(state().signers.map((s) => s.docId)).toEqual(['doc-2']);
    expect(state().fields).toEqual([]);
  });
});

describe('clearRequest', () => {
  it('drops the draft (signers and fields) but keeps the sent history', () => {
    const signer = state().addSigner('doc-1', 'Pat Morgan', 'pat@example.com');
    addField('doc-1', signer);
    state().recordSent('doc-1', receipt('env-1'));
    state().setPlacing('signature');

    state().clearRequest('doc-1');

    expect(state().signers).toEqual([]);
    expect(state().fields).toEqual([]);
    expect(state().sent).toHaveLength(1);
    expect(state().placing).toBeNull();
    expect(state().selectedFieldId).toBeNull();
  });
});
