// src/app/services/notificationService.ts
import { Injectable, inject } from '@angular/core';
import { UserRepository } from '../repositories/interfaces/user.repository';

/**
 * Centralised browser push-notification service.
 *
 * Design contract
 * ──────────────
 * • Never calls Notification.requestPermission() automatically.
 *   The caller MUST invoke requestPermission() only from a real user gesture
 *   (i.e. a button-click handler) to satisfy the browser's user-activation
 *   requirement.
 *
 * • Session dismissal is stored in sessionStorage so it is automatically
 *   wiped on every new login (AuthenticationService clears sessionStorage
 *   at the start of each login attempt).
 *
 * • Persistent opt-out ("not_allowed") is written to Firestore only when the
 *   user explicitly grants or the browser returns "denied" after our prompt.
 *   Simply closing the modal ("Not Now") only sets the session flag.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly SESSION_DISMISSED_KEY = 'ntf_modal_dismissed';
  private userRepo = inject(UserRepository);

  // ── Browser capability ─────────────────────────────────────────────────

  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  get isGranted(): boolean {
    return this.isSupported && Notification.permission === 'granted';
  }

  /**
   * Returns the current native browser permission state.
   * Returns 'default' when notifications are not supported.
   */
  getPermissionState(): NotificationPermission | 'default' {
    if (!this.isSupported) return 'default';
    return Notification.permission;
  }

  // ── Permission gate ────────────────────────────────────────────────────

  /**
   * Determines whether our custom notification opt-in modal should be shown.
   *
   * Returns true when ALL of the following hold:
   *  1. Notifications are supported by the browser.
   *  2. The browser permission is still 'default' (user has not yet made a
   *     native browser choice — Allow or Block).
   *  3. The user has not dismissed the modal earlier in this session.
   *  4. The user's Firestore record does NOT have notification_permission
   *     set to 'not_allowed' (they haven't permanently opted out via our UI).
   */
  async shouldShowModal(userId: string): Promise<boolean> {
    if (!this.isSupported) return false;
    if (Notification.permission !== 'default') return false;
    if (this.isSessionDismissed()) return false;

    try {
      const record = await this.userRepo.getUserById(userId);
      if (record && (record as any)['notification_permission'] === 'not_allowed') {
        return false;
      }
    } catch {
      // If Firestore is unreachable, fall back to showing the modal.
    }

    return true;
  }

  // ── User-gesture actions ───────────────────────────────────────────────

  /**
   * Calls the native Notification.requestPermission() API.
   * MUST be called only from a button-click handler (user gesture).
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) return 'default';
    try {
      return await Notification.requestPermission();
    } catch (err) {
      console.warn('[Notifications] Permission request failed:', err);
      return 'default';
    }
  }

  // ── Persistence helpers ────────────────────────────────────────────────

  /**
   * Saves a session-only dismissal flag.
   * Does NOT write anything to Firestore.
   * The flag is automatically cleared when sessionStorage is wiped on
   * the next login (AuthenticationService.login() calls sessionStorage.clear()).
   */
  markSessionDismissed(): void {
    try {
      sessionStorage.setItem(this.SESSION_DISMISSED_KEY, '1');
    } catch { /* private-browsing / storage full — safe to ignore */ }
  }

  /** Returns true if the user dismissed the modal earlier this session. */
  isSessionDismissed(): boolean {
    try {
      return sessionStorage.getItem(this.SESSION_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Persists 'allowed' to Firestore after the browser grants permission.
   */
  async markGranted(userId: string): Promise<void> {
    await this.savePreference(userId, 'allowed');
  }

  /**
   * Persists 'not_allowed' to Firestore when the browser returns 'denied'
   * after our prompt (the user clicked Block in the native dialog).
   */
  async markDenied(userId: string): Promise<void> {
    await this.savePreference(userId, 'not_allowed');
  }

  // ── Notification sending ───────────────────────────────────────────────

  send(title: string, body: string, tag?: string): void {
    if (!this.isGranted) return;
    try {
      const notification = new Notification(title, {
        body,
        icon: '/icon-192x192.png',
        tag: tag || `intellirx-${Date.now()}`,
        silent: false,
      });
      setTimeout(() => notification.close(), 5000);
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch (err) {
      console.warn('[Notifications] Failed to send notification:', err);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async savePreference(
    userId: string,
    preference: 'allowed' | 'not_allowed'
  ): Promise<void> {
    try {
      await this.userRepo.updateUser(userId, { notification_permission: preference } as any);
    } catch (err) {
      console.error('[Notifications] Failed to save preference:', err);
    }
  }
}
