import { describe, expect, it } from 'vitest';
import { isExternalWebLink } from './external-link';

describe('what may leave the app as a web link', () => {
  it('lets an https URL through', () => {
    expect(isExternalWebLink('https://www.legion.law')).toBe(true);
    expect(isExternalWebLink('https://legion.law/some/page?q=1')).toBe(true);
  });

  it('refuses every other scheme', () => {
    for (const target of [
      'http://www.legion.law',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'ms-word:ofe|u|C:\\x.docx',
      'data:text/html,<h1>hi</h1>',
    ]) {
      expect(isExternalWebLink(target)).toBe(false);
    }
  });

  it('treats file paths as paths, drive letter and all', () => {
    expect(isExternalWebLink('C:\\Users\\rothr\\Exhibit A.pdf')).toBe(false);
    expect(isExternalWebLink('/home/user/exhibit.pdf')).toBe(false);
    expect(isExternalWebLink('Exhibit A.pdf')).toBe(false);
    expect(isExternalWebLink('')).toBe(false);
  });

  it('is not fooled by an https-looking prefix that is not a scheme', () => {
    expect(isExternalWebLink('https:/www.legion.law')).toBe(true);
    expect(isExternalWebLink('nothttps://www.legion.law')).toBe(false);
    expect(isExternalWebLink('  https://www.legion.law')).toBe(true);
  });
});
