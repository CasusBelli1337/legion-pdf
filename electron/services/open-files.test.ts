/**
 * The OS hand-off: what counts as a file on the command line, whether Explorer
 * asked for tabs or for a combine, and the promise that a path handed over
 * before the renderer exists still opens.
 */

import { posix, win32 } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenFilesRelay, launchIntentFromArgv, naturalFileOrder } from './open-files';

const EXE = 'C:\\Users\\rothr\\AppData\\Local\\Programs\\Legion PDF\\Legion PDF.exe';
const CWD = 'C:\\Users\\rothr\\Documents';

describe('launchIntentFromArgv', () => {
  it('takes the PDF Explorer passed and ignores the executable itself', () => {
    expect(launchIntentFromArgv([EXE, 'C:\\Matters\\Ashford\\deposition.pdf'], CWD, win32)).toEqual(
      {
        intent: 'open',
        paths: ['C:\\Matters\\Ashford\\deposition.pdf'],
      }
    );
  });

  it('keeps a path with spaces whole', () => {
    const path = 'C:\\Users\\rothr\\OneDrive\\#Legion\\Motion to Compel (final).pdf';
    expect(launchIntentFromArgv([EXE, path], CWD, win32).paths).toEqual([path]);
  });

  it('takes every file when several are opened at once, in the order given', () => {
    const argv = [EXE, 'C:\\a\\second.pdf', 'C:\\a\\first.pdf', 'C:\\a\\third.pdf'];
    expect(launchIntentFromArgv(argv, CWD, win32).paths).toEqual([
      'C:\\a\\second.pdf',
      'C:\\a\\first.pdf',
      'C:\\a\\third.pdf',
    ]);
  });

  it('takes Word documents and images too — everything that can become a PDF', () => {
    const argv = [EXE, 'C:\\a\\notes.docx', 'C:\\a\\scan.PDF', 'C:\\a\\photo.png'];
    expect(launchIntentFromArgv(argv, CWD, win32).paths).toEqual([
      'C:\\a\\notes.docx',
      'C:\\a\\scan.PDF',
      'C:\\a\\photo.png',
    ]);
  });

  it('still drops a file type nothing can open', () => {
    const argv = [EXE, 'C:\\a\\archive.zip', 'C:\\a\\brief.pdf', 'C:\\a\\video.mp4'];
    expect(launchIntentFromArgv(argv, CWD, win32).paths).toEqual(['C:\\a\\brief.pdf']);
  });

  it('filters out Chromium and dev switches, including one carrying a .pdf value', () => {
    const argv = [
      EXE,
      '--disable-gpu',
      '--remote-debugging-port=9450',
      '--user-data-dir=/tmp/librarius.pdf',
      '.',
      '/home/casusbelli/projects/legion-librarius/out/main/index.js',
      '/tmp/real.pdf',
    ];
    expect(launchIntentFromArgv(argv, CWD, posix).paths).toEqual(['/tmp/real.pdf']);
  });

  it('resolves a relative path against the working directory it was typed in', () => {
    expect(
      launchIntentFromArgv(['/opt/librarius', 'exhibit.pdf'], '/home/casusbelli/matters', posix)
        .paths
    ).toEqual(['/home/casusbelli/matters/exhibit.pdf']);
  });

  it('opens a file named twice on one command line only once', () => {
    const argv = [EXE, 'C:\\a\\same.pdf', 'C:\\a\\same.pdf'];
    expect(launchIntentFromArgv(argv, CWD, win32).paths).toEqual(['C:\\a\\same.pdf']);
  });

  it('answers with nothing for a plain launch', () => {
    expect(launchIntentFromArgv([EXE], CWD, win32)).toEqual({ intent: 'open', paths: [] });
    expect(launchIntentFromArgv([], CWD, win32)).toEqual({ intent: 'open', paths: [] });
  });

  it('reads --combine as the Explorer combine verb', () => {
    const argv = [EXE, '--combine', 'C:\\a\\part-a.pdf'];
    expect(launchIntentFromArgv(argv, CWD, win32)).toEqual({
      intent: 'combine',
      paths: ['C:\\a\\part-a.pdf'],
    });
  });

  it('accepts --combine wherever it lands on the command line', () => {
    const trailing = [EXE, 'C:\\a\\part-a.pdf', '--combine'];
    const middle = [EXE, 'C:\\a\\part-a.pdf', '--combine', 'C:\\a\\part-b.docx'];
    expect(launchIntentFromArgv(trailing, CWD, win32).intent).toBe('combine');
    expect(launchIntentFromArgv(middle, CWD, win32)).toEqual({
      intent: 'combine',
      paths: ['C:\\a\\part-a.pdf', 'C:\\a\\part-b.docx'],
    });
  });

  it('combines a mixed selection of PDFs, Word documents, and images', () => {
    const argv = [
      EXE,
      '--combine',
      'C:\\a\\brief.pdf',
      '--combine',
      'C:\\a\\declaration.docx',
      '--combine',
      'C:\\a\\exhibit.png',
    ];
    expect(launchIntentFromArgv(argv, CWD, win32)).toEqual({
      intent: 'combine',
      paths: ['C:\\a\\brief.pdf', 'C:\\a\\declaration.docx', 'C:\\a\\exhibit.png'],
    });
  });

  it('is a plain launch when --combine arrives with no file at all', () => {
    expect(launchIntentFromArgv([EXE, '--combine'], CWD, win32)).toEqual({
      intent: 'open',
      paths: [],
    });
  });
});

describe('naturalFileOrder', () => {
  it('counts numbers as numbers, so Exhibit 2 comes before Exhibit 10', () => {
    const paths = ['C:\\a\\Exhibit 10.pdf', 'C:\\a\\Exhibit 2.pdf', 'C:\\a\\Exhibit 1.pdf'];
    expect(naturalFileOrder(paths)).toEqual([
      'C:\\a\\Exhibit 1.pdf',
      'C:\\a\\Exhibit 2.pdf',
      'C:\\a\\Exhibit 10.pdf',
    ]);
  });

  it('sorts on the file name, not the folder it sits in', () => {
    const paths = ['C:\\zeta\\b.pdf', 'C:\\alpha\\c.pdf', 'C:\\mid\\a.pdf'];
    expect(naturalFileOrder(paths)).toEqual([
      'C:\\mid\\a.pdf',
      'C:\\zeta\\b.pdf',
      'C:\\alpha\\c.pdf',
    ]);
  });

  it('keeps same-named files apart by their folder', () => {
    const paths = ['C:\\z\\same.pdf', 'C:\\a\\same.pdf'];
    expect(naturalFileOrder(paths)).toEqual(['C:\\a\\same.pdf', 'C:\\z\\same.pdf']);
  });
});

describe('OpenFilesRelay', () => {
  afterEach(() => vi.useRealTimers());

  const opened = (paths: string[]) => ({ intent: 'open' as const, paths });
  const combined = (paths: string[]) => ({ intent: 'combine' as const, paths });

  it('holds a launch-time path until the renderer is loaded, then delivers it', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(opened(['C:\\a\\one.pdf']));
    expect(deliver).not.toHaveBeenCalled();

    relay.ready(deliver);
    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\one.pdf'],
      intent: 'open',
    });
  });

  it('flushes a backlog in arrival order as one event', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(opened(['C:\\a\\one.pdf']));
    relay.offer(opened(['C:\\a\\two.pdf', 'C:\\a\\three.pdf']));
    relay.ready(deliver);

    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\one.pdf', 'C:\\a\\two.pdf', 'C:\\a\\three.pdf'],
      intent: 'open',
    });
  });

  it('passes a later second-instance path straight through', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();
    relay.ready(deliver);

    relay.offer(opened(['C:\\a\\later.pdf']));

    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\later.pdf'],
      intent: 'open',
    });
  });

  it('never delivers the same batch twice', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(opened(['C:\\a\\one.pdf']));
    relay.ready(deliver);
    relay.ready(deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('never delivers an empty event', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.ready(deliver);
    relay.offer(opened([]));
    relay.offer(combined([]));

    expect(deliver).not.toHaveBeenCalled();
  });

  it('queues again once the window is gone, and delivers on the next window', () => {
    const relay = new OpenFilesRelay();
    const first = vi.fn();
    const second = vi.fn();

    relay.ready(first);
    relay.suspend();
    relay.offer(opened(['C:\\a\\while-closed.pdf']));
    expect(first).not.toHaveBeenCalled();

    relay.ready(second);
    expect(second).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\while-closed.pdf'],
      intent: 'open',
    });
  });

  it('gathers the one-process-per-file combine launches into a single event', () => {
    vi.useFakeTimers();
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();
    relay.ready(deliver);

    relay.offer(combined(['C:\\a\\part-b.pdf']));
    vi.advanceTimersByTime(200);
    relay.offer(combined(['C:\\a\\part-c.pdf']));
    vi.advanceTimersByTime(200);
    relay.offer(combined(['C:\\a\\part-a.pdf']));
    expect(deliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\part-a.pdf', 'C:\\a\\part-b.pdf', 'C:\\a\\part-c.pdf'],
      intent: 'combine',
    });
  });

  it('waits out the quiet window from the LAST arrival, not the first', () => {
    vi.useFakeTimers();
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();
    relay.ready(deliver);

    relay.offer(combined(['C:\\a\\one.pdf']));
    vi.advanceTimersByTime(1400);
    relay.offer(combined(['C:\\a\\two.pdf']));
    vi.advanceTimersByTime(1400);
    expect(deliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\one.pdf', 'C:\\a\\two.pdf'],
      intent: 'combine',
    });
  });

  it('combines a file Explorer launched twice only once', () => {
    vi.useFakeTimers();
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();
    relay.ready(deliver);

    relay.offer(combined(['C:\\a\\same.pdf']));
    relay.offer(combined(['C:\\a\\same.pdf']));
    vi.advanceTimersByTime(1500);

    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\same.pdf'],
      intent: 'combine',
    });
  });

  it('holds a combine batch whose window closed while no window was up', () => {
    vi.useFakeTimers();
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(combined(['C:\\a\\part-a.pdf', 'C:\\a\\part-b.pdf']));
    vi.advanceTimersByTime(1500);
    expect(deliver).not.toHaveBeenCalled();

    relay.ready(deliver);
    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\part-a.pdf', 'C:\\a\\part-b.pdf'],
      intent: 'combine',
    });
  });

  it('keeps an open batch and a combine batch as two separate events', () => {
    vi.useFakeTimers();
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();
    relay.ready(deliver);

    relay.offer(opened(['C:\\a\\reading.pdf']));
    relay.offer(combined(['C:\\a\\part-a.pdf']));
    vi.advanceTimersByTime(1500);

    expect(deliver).toHaveBeenNthCalledWith(1, {
      paths: ['C:\\a\\reading.pdf'],
      intent: 'open',
    });
    expect(deliver).toHaveBeenNthCalledWith(2, {
      paths: ['C:\\a\\part-a.pdf'],
      intent: 'combine',
    });
  });
});
