import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { AddVisitPageComponent } from './add-visit-page';

describe('AddVisitPageComponent', () => {
  describe('escapeHtml', () => {
    const escapeHtml = AddVisitPageComponent.prototype.escapeHtml;

    it('should return empty string for null, undefined, or empty input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml('')).toBe('');
    });

    it('should escape special HTML characters to prevent DOM XSS vulnerabilities', () => {
      const input = '<script>alert("XSS & Injection")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS &amp; Injection&quot;)&lt;/script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("Doctor's Note")).toBe('Doctor&#39;s Note');
    });

    it('should convert numbers to string safely', () => {
      expect(escapeHtml(42)).toBe('42');
    });
  });
});
