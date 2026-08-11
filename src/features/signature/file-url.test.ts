import { describe, expect, it } from 'vitest';
import { fileUrl } from './file-url';

describe('fileUrl', () => {
  it('turns a Windows path into a three-slash file URL', () => {
    expect(fileUrl('C:\\Users\\rothr\\AppData\\sig.png')).toBe(
      'file:///C:/Users/rothr/AppData/sig.png'
    );
  });

  it('leaves a POSIX path rooted where it already is', () => {
    expect(fileUrl('/home/arthur/.config/sig.png')).toBe('file:///home/arthur/.config/sig.png');
  });

  it('escapes spaces and the characters that would end the path early', () => {
    expect(fileUrl('/tmp/my signatures/full sig.png')).toBe(
      'file:///tmp/my%20signatures/full%20sig.png'
    );
    expect(fileUrl('/tmp/a#b?c.png')).toBe('file:///tmp/a%23b%3Fc.png');
  });
});
