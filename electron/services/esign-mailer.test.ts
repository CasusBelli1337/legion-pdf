import { describe, expect, it, vi } from 'vitest';
import type { EsignEmailRequest } from '@shared/types';
import { buildRequestMessage, sendRequestEmails } from './esign-mailer';

const CREDENTIALS = {
  baseUrl: 'http://armory-ec2.tail1a3aad.ts.net/tools/outreach',
  token: 'svc-token-1234567890',
  from: 'attorney@example.com',
};

const REQUEST: EsignEmailRequest = {
  title: 'Settlement Agreement',
  message: 'Please sign by Friday.\nCall me with any questions.',
  requesterName: 'Alex Prentiss',
  recipients: [
    {
      id: 's1',
      name: 'Maria Vance',
      email: 'maria.vance@example.com',
      url: 'https://sign.example.net/s/aaa',
    },
    {
      id: 's2',
      name: 'Declan Ruiz',
      email: 'declan.ruiz@example.com',
      url: 'https://sign.example.net/s/bbb',
    },
  ],
};

function reply(status: number, contentType: string, body = '{}'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

const sentOk = (): Response => reply(200, 'application/json', '{"id":"gm1"}');

describe('buildRequestMessage', () => {
  it('builds the subject, button, raw-link fallback, and quoted note', () => {
    const message = buildRequestMessage(REQUEST, REQUEST.recipients[0]!);

    expect(message.subject).toBe('Signature requested: Settlement Agreement');
    expect(message.html).toContain('#61003A');
    expect(message.html).toContain('href="https://sign.example.net/s/aaa"');
    // The raw link appears as visible text too, for clients that strip buttons.
    expect(message.html).toContain('>https://sign.example.net/s/aaa</a>');
    expect(message.html).toContain('Hello Maria Vance,');
    expect(message.html).toContain('Alex Prentiss has asked you to sign');
    expect(message.html).toContain('Please sign by Friday.<br>Call me with any questions.');
    expect(message.text).toContain('Sign here: https://sign.example.net/s/aaa');
    expect(message.text).toContain('Please sign by Friday.');
  });

  it('escapes HTML in everything the attorney or signer typed', () => {
    const hostile: EsignEmailRequest = {
      ...REQUEST,
      title: 'Deal <B&B> "final"',
      message: '<script>alert(1)</script>',
      requesterName: 'A & B LLP',
    };
    const message = buildRequestMessage(hostile, {
      id: 's1',
      name: '<Maria>',
      email: 'maria.vance@example.com',
      url: 'https://sign.example.net/s/aaa?x=1&y=2',
    });

    expect(message.html).toContain('Deal &lt;B&amp;B&gt; &quot;final&quot;');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('Hello &lt;Maria&gt;,');
    expect(message.html).toContain('href="https://sign.example.net/s/aaa?x=1&amp;y=2"');
  });

  it('strips line breaks from the subject so headers cannot be injected', () => {
    const message = buildRequestMessage(
      { ...REQUEST, title: 'Deal\r\nBcc: everyone@example.com' },
      REQUEST.recipients[0]!
    );
    expect(message.subject).toBe('Signature requested: Deal Bcc: everyone@example.com');
  });

  it('omits the quote block when the attorney wrote no note', () => {
    const message = buildRequestMessage({ ...REQUEST, message: '   ' }, REQUEST.recipients[0]!);
    expect(message.html).not.toContain('<blockquote');
  });
});

describe('sendRequestEmails', () => {
  it('posts one send per recipient to Outreach with the bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sentOk());

    const result = await sendRequestEmails(REQUEST, CREDENTIALS, fetchImpl as typeof fetch);

    expect(result).toEqual({ sent: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CREDENTIALS.baseUrl}/service/send-founder-email`);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${CREDENTIALS.token}`
    );
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.to).toBe('maria.vance@example.com');
    expect(body.from).toBe('attorney@example.com');
    expect(body.subject).toBe('Signature requested: Settlement Agreement');
    expect(body.html).toContain('https://sign.example.net/s/aaa');
    const second = JSON.parse((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.to).toBe('declan.ruiz@example.com');
  });

  it('refuses an empty recipient list loudly', async () => {
    const fetchImpl = vi.fn();
    await expect(
      sendRequestEmails({ ...REQUEST, recipients: [] }, CREDENTIALS, fetchImpl as typeof fetch)
    ).rejects.toThrow('There is nobody to email');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a 401 to the service-token sentence, without the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(401, 'application/json', '{"error":"no"}'));

    let thrown: unknown;
    try {
      await sendRequestEmails(REQUEST, CREDENTIALS, fetchImpl as typeof fetch);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe(
      'The Armory rejected the service token — check the E-Sign settings.'
    );
    expect((thrown as Error).message).not.toContain(CREDENTIALS.token);
  });

  it('maps a 503 to the mailbox-not-connected sentence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(503, 'application/json', '{"error":"x"}'));
    await expect(
      sendRequestEmails(REQUEST, CREDENTIALS, fetchImpl as typeof fetch)
    ).rejects.toThrow('Your mailbox is not connected in Outreach');
  });

  it('recognises the Armory sign-in page — the send path not yet opened', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(reply(200, 'text/html; charset=utf-8', '<!DOCTYPE html><html></html>'));
    await expect(
      sendRequestEmails(REQUEST, CREDENTIALS, fetchImpl as typeof fetch)
    ).rejects.toThrow('answered with its sign-in page');
  });

  it('reads a bare login redirect the same way as the sign-in page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    await expect(
      sendRequestEmails(REQUEST, CREDENTIALS, fetchImpl as typeof fetch)
    ).rejects.toThrow('answered with its sign-in page');
  });

  it('reports how many emails already left when a later send fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(sentOk())
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(
      sendRequestEmails(REQUEST, CREDENTIALS, fetchImpl as typeof fetch)
    ).rejects.toThrow(
      'Could not reach the Armory — check that Tailscale is running on this computer. ' +
        '1 of the 2 request emails had already been sent.'
    );
  });
});
