import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import type { EsignEmailRequest } from '@shared/types';
import { buildRequestMessage, sendRequestEmails } from './esign-mailer';

const CREDENTIALS = { address: 'attorney@example.com', appPassword: 'abcd efgh ijkl mnop' };

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
  it('sends one email per recipient from the attorney and counts them', async () => {
    const transport = createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(transport, 'sendMail');

    const result = await sendRequestEmails(REQUEST, CREDENTIALS, transport);

    expect(result).toEqual({ sent: 2 });
    expect(sendMail).toHaveBeenCalledTimes(2);
    const first = sendMail.mock.calls[0]![0];
    expect(first.from).toEqual({ name: 'Alex Prentiss', address: 'attorney@example.com' });
    expect(first.to).toEqual({ name: 'Maria Vance', address: 'maria.vance@example.com' });
    expect(first.subject).toBe('Signature requested: Settlement Agreement');
    expect(first.html).toContain('https://sign.example.net/s/aaa');
    expect(first.text).toContain('https://sign.example.net/s/aaa');
    const second = sendMail.mock.calls[1]![0];
    expect(second.to).toEqual({ name: 'Declan Ruiz', address: 'declan.ruiz@example.com' });
    expect(second.html).toContain('https://sign.example.net/s/bbb');
  });

  it('refuses an empty recipient list loudly', async () => {
    const transport = createTransport({ jsonTransport: true });
    await expect(
      sendRequestEmails({ ...REQUEST, recipients: [] }, CREDENTIALS, transport)
    ).rejects.toThrow('There is nobody to email');
  });

  it('maps an auth failure to the app-password sentence, without the password', async () => {
    const transport = {
      sendMail: vi.fn().mockRejectedValue(Object.assign(new Error('535 5.7.8'), { code: 'EAUTH' })),
      close: vi.fn(),
    } as unknown as Transporter;

    let thrown: unknown;
    try {
      await sendRequestEmails(REQUEST, CREDENTIALS, transport);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe(
      'Gmail rejected the sender sign-in — check the app password.'
    );
    expect((thrown as Error).message).not.toContain(CREDENTIALS.appPassword);
  });

  it('reports how many emails already left when a later send fails', async () => {
    const sendMail = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNECTION' }));
    const close = vi.fn();
    const transport = { sendMail, close } as unknown as Transporter;

    await expect(sendRequestEmails(REQUEST, CREDENTIALS, transport)).rejects.toThrow(
      'Could not reach Gmail — check your internet connection. ' +
        '1 of the 2 request emails had already been sent.'
    );
    expect(close).toHaveBeenCalled();
  });

  it('closes the transport after a clean run too', async () => {
    const transport = createTransport({ jsonTransport: true });
    const close = vi.spyOn(transport, 'close');
    await sendRequestEmails(REQUEST, CREDENTIALS, transport);
    expect(close).toHaveBeenCalled();
  });
});
