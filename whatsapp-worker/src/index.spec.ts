import { describe, it, expect, vi } from 'vitest';
import worker, { timingSafeEqual, isValidPhone, isValidHttpUrl } from './index';

describe('WhatsApp Worker Security & Validation', () => {
  describe('timingSafeEqual', () => {
    it('should return true for identical strings', () => {
      expect(timingSafeEqual('secret123', 'secret123')).toBe(true);
    });

    it('should return false for different strings of same length', () => {
      expect(timingSafeEqual('secret123', 'secret124')).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      expect(timingSafeEqual('secret123', 'secret1234')).toBe(false);
    });

    it('should return false when first argument is null or empty', () => {
      expect(timingSafeEqual(null, 'secret123')).toBe(false);
      expect(timingSafeEqual('', 'secret123')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should accept valid E.164 phone number strings without plus sign', () => {
      expect(isValidPhone('919876543210')).toBe(true);
      expect(isValidPhone('1234567')).toBe(true);
    });

    it('should reject invalid phone numbers with special characters or spaces', () => {
      expect(isValidPhone('+919876543210')).toBe(false);
      expect(isValidPhone('91-9876543210')).toBe(false);
      expect(isValidPhone('abc12345')).toBe(false);
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone(undefined)).toBe(false);
    });
  });

  describe('isValidHttpUrl', () => {
    it('should accept valid http and https URLs', () => {
      expect(isValidHttpUrl('https://example.com/pdf')).toBe(true);
      expect(isValidHttpUrl('http://example.com/pdf')).toBe(true);
    });

    it('should reject invalid or unsafe URL schemes', () => {
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpUrl('data:text/html,test')).toBe(false);
      expect(isValidHttpUrl('ftp://example.com')).toBe(false);
      expect(isValidHttpUrl('')).toBe(false);
      expect(isValidHttpUrl(undefined)).toBe(false);
    });
  });

  describe('fetch error response masking', () => {
    it('should mask internal error messages in 500 response', async () => {
      const request = new Request('https://worker.local/notify/appointment', {
        method: 'POST',
        headers: {
          'X-Worker-Secret': 'test_secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: 'invalid_phone' }),
      });

      const env = {
        WA_ACCESS_TOKEN: 'token',
        WA_PHONE_NUMBER_ID: '123',
        WORKER_SECRET: 'test_secret',
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(500);

      const body = await response.json();
      // Should return generic error message rather than leaking internal exception detail
      expect(body.error).toBe('Failed to send WhatsApp notification');
      expect(body.error).not.toContain('invalid_phone');

      consoleSpy.mockRestore();
    });
  });
});
