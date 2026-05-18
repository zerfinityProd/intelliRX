import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';

/**
 * Handles browser push notification permission requests, persists
 * the user's choice ('allowed' | 'not_allowed') in the Firestore
 * users collection, and fires native browser notifications for
 * key application events (patient added, appointment booked, visit added).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(FirestoreApiService);

  /**
   * Check whether the browser supports the Notification API at all.
   */
  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /** Whether notifications are currently allowed by the browser. */
  get isGranted(): boolean {
    return this.isSupported && Notification.permission === 'granted';
  }

  /**
   * Prompt the user for notification permission **only if** they haven't
   * explicitly allowed or blocked it.
   *
   * Behavior:
   * - If user clicked **Allow** → saves 'allowed', won't prompt again.
   * - If user clicked **Block** → saves 'not_allowed', won't prompt again.
   * - If user **dismissed** the prompt (clicked X / ignored it) → saves nothing,
   *   so the prompt will re-appear on the next login.
   * - If the browser permission changed externally (e.g. user toggled it in
   *   browser settings), the Firestore record is synced accordingly.
   *
   * @param userId  The Firestore document ID of the user (from `users` collection).
   */
  async promptIfNeeded(userId: string): Promise<void> {
    if (!this.isSupported || !userId) return;

    // 1. Read current Firestore preference (if any)
    let storedPref: string | null = null;
    try {
      const result = await this.api.getDocument('users', userId);
      if (result) {
        storedPref = result.data['notification_permission'] || null;
      }
    } catch {
      // User doc may not exist yet — skip notification prompt silently
      return;
    }

    // 2. Sync: if user changed browser settings externally, update Firestore
    if (Notification.permission === 'granted' && storedPref !== 'allowed') {
      await this.savePreference(userId, 'allowed');
      console.log('[Notifications] Synced: browser granted → Firestore updated to allowed');
      return;
    }
    if (Notification.permission === 'denied') {
      if (storedPref !== 'not_allowed') {
        await this.savePreference(userId, 'not_allowed');
        console.log('[Notifications] Synced: browser denied → Firestore updated to not_allowed');
      }
      return; // Can't prompt — browser has permanently blocked
    }

    // 3. Browser permission is 'default' (not yet decided)
    //    Only skip prompting if user explicitly allowed/blocked before
    //    (storedPref is 'allowed' or 'not_allowed')
    //    If storedPref is null/empty → user dismissed last time → re-prompt
    if (storedPref === 'allowed' || storedPref === 'not_allowed') {
      console.log('[Notifications] Preference already stored:', storedPref);
      return;
    }

    // 4. Show the native browser permission dialog
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        await this.savePreference(userId, 'allowed');
        console.log('[Notifications] User allowed notifications');
      } else if (result === 'denied') {
        await this.savePreference(userId, 'not_allowed');
        console.log('[Notifications] User blocked notifications');
      } else {
        // result === 'default' → user dismissed the prompt
        // Don't save anything — will re-prompt on next login
        console.log('[Notifications] User dismissed the prompt — will ask again next login');
      }
    } catch (err) {
      console.warn('[Notifications] Permission request failed:', err);
      // Don't save — will retry next login
    }
  }

  /**
   * Fire a native browser notification.
   * Only sends if the browser supports notifications AND permission is granted.
   *
   * @param title  The notification title (e.g. "Patient Added")
   * @param body   The notification body text (e.g. "John Doe has been added successfully")
   * @param tag    Optional tag to prevent duplicate notifications with the same tag
   */
  send(title: string, body: string, tag?: string): void {
    if (!this.isGranted) {
      console.log('[Notifications] Not granted — skipping notification:', title);
      return;
    }

    try {
      const notification = new Notification(title, {
        body,
        icon: '/icon-192x192.png',
        tag: tag || `intellirx-${Date.now()}`,
        silent: false,
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      // Focus the app tab when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      console.log('[Notifications] Sent:', title, '—', body);
    } catch (err) {
      console.warn('[Notifications] Failed to send notification:', err);
    }
  }

  /**
   * Persist the notification preference to Firestore.
   */
  private async savePreference(userId: string, preference: 'allowed' | 'not_allowed'): Promise<void> {
    try {
      await this.api.updateDocument('users', userId, { notification_permission: preference });
      console.log('[Notifications] Saved preference for', userId, '→', preference);
    } catch (err) {
      console.error('[Notifications] Failed to save preference:', err);
    }
  }
}
