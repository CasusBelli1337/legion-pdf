/**
 * The OS hand-off: what counts as a file on the command line, and the promise
 * that a path handed over before the renderer exists still opens.
 */

import { posix, win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OpenFilesRelay, pdfPathsFromArgv } from './open-files';

const EXE = 'C:\\Users\\rothr\\AppData\\Local\\Programs\\Legion PDF\\Legion PDF.exe';
const CWD = 'C:\\Users\\rothr\\Documents';

describe('pdfPathsFromArgv', () => {
  it('takes the PDF Explorer passed and ignores the executable itself', () => {
    expect(pdfPathsFromArgv([EXE, 'C:\\Matters\\Ashford\\deposition.pdf'], CWD, win32)).toEqual([
      'C:\\Matters\\Ashford\\deposition.pdf',
    ]);
  });

  it('keeps a path with spaces whole', () => {
    const path = 'C:\\Users\\rothr\\OneDrive\\#Legion\\Motion to Compel (final).pdf';
    expect(pdfPathsFromArgv([EXE, path], CWD, win32)).toEqual([path]);
  });

  it('takes every file when several are opened at once, in the order given', () => {
    const argv = [EXE, 'C:\\a\\second.pdf', 'C:\\a\\first.pdf', 'C:\\a\\third.pdf'];
    expect(pdfPathsFromArgv(argv, CWD, win32)).toEqual([
      'C:\\a\\second.pdf',
      'C:\\a\\first.pdf',
      'C:\\a\\third.pdf',
    ]);
  });

  it('filters out non-PDF junk', () => {
    const argv = [EXE, 'C:\\a\\notes.docx', 'C:\\a\\scan.PDF', 'C:\\a\\photo.png'];
    expect(pdfPathsFromArgv(argv, CWD, win32)).toEqual(['C:\\a\\scan.PDF']);
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
    expect(pdfPathsFromArgv(argv, CWD, posix)).toEqual(['/tmp/real.pdf']);
  });

  it('resolves a relative path against the working directory it was typed in', () => {
    expect(
      pdfPathsFromArgv(['/opt/librarius', 'exhibit.pdf'], '/home/casusbelli/matters', posix)
    ).toEqual(['/home/casusbelli/matters/exhibit.pdf']);
  });

  it('opens a file named twice on one command line only once', () => {
    const argv = [EXE, 'C:\\a\\same.pdf', 'C:\\a\\same.pdf'];
    expect(pdfPathsFromArgv(argv, CWD, win32)).toEqual(['C:\\a\\same.pdf']);
  });

  it('answers with nothing for a plain launch', () => {
    expect(pdfPathsFromArgv([EXE], CWD, win32)).toEqual([]);
    expect(pdfPathsFromArgv([], CWD, win32)).toEqual([]);
  });
});

describe('OpenFilesRelay', () => {
  it('holds a launch-time path until the renderer is loaded, then delivers it', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(['C:\\a\\one.pdf']);
    expect(deliver).not.toHaveBeenCalled();

    relay.ready(deliver);
    expect(deliver).toHaveBeenCalledExactlyOnceWith({ paths: ['C:\\a\\one.pdf'] });
  });

  it('flushes a backlog in arrival order as one event', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(['C:\\a\\one.pdf']);
    relay.offer(['C:\\a\\two.pdf', 'C:\\a\\three.pdf']);
    relay.ready(deliver);

    expect(deliver).toHaveBeenCalledExactlyOnceWith({
      paths: ['C:\\a\\one.pdf', 'C:\\a\\two.pdf', 'C:\\a\\three.pdf'],
    });
  });

  it('passes a later second-instance path straight through', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();
    relay.ready(deliver);

    relay.offer(['C:\\a\\later.pdf']);

    expect(deliver).toHaveBeenCalledExactlyOnceWith({ paths: ['C:\\a\\later.pdf'] });
  });

  it('never delivers the same batch twice', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.offer(['C:\\a\\one.pdf']);
    relay.ready(deliver);
    relay.ready(deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('never delivers an empty event', () => {
    const relay = new OpenFilesRelay();
    const deliver = vi.fn();

    relay.ready(deliver);
    relay.offer([]);

    expect(deliver).not.toHaveBeenCalled();
  });

  it('queues again once the window is gone, and delivers on the next window', () => {
    const relay = new OpenFilesRelay();
    const first = vi.fn();
    const second = vi.fn();

    relay.ready(first);
    relay.suspend();
    relay.offer(['C:\\a\\while-closed.pdf']);
    expect(first).not.toHaveBeenCalled();

    relay.ready(second);
    expect(second).toHaveBeenCalledExactlyOnceWith({ paths: ['C:\\a\\while-closed.pdf'] });
  });
});
