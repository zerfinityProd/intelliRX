import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';

/**
 * Handles browser push notification permission requests and persists
 * the user's choice ('allowed' | 'not_allowed') in the Firestore
 * users collection so we remember their preference across sessions.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private firestore = inject(Firestore);

  /**
   * Check whether the browser supports the Notification API at all.
   */
  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Prompt the user for notification permission **only if** they haven't
   * already responded (i.e. no `notification_permission` field in Firestore).
   *
   * @param userId  The Firestore document ID of the user (from `users` collection).
   */
  async promptIfNeeded(userId: string): Promise<void> {
    if (!this.isSupported || !userId) return;

    // 1. Check Firestore to see if the user already answered
    const userDocRef = doc(this.firestore, 'users', userId);
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        // If preference is already stored, don't prompt again
        if (data['notification_permission']) {
          console.log('[Notifications] Preference already stored:', data['notification_permission']);
          return;
        }
      }
    } catch (err) {
      console.warn('[Notifications] Could not read user doc, skipping prompt:', err);
      return;
    }

    // 2. If the browser has already denied permanently, store that and bail
    if (Notification.permission === 'denied') {
      await this.savePreference(userId, 'not_allowed');
      return;
    }

    // 3. If already granted (e.g. user allowed previously on this browser), save and bail
    if (Notification.permission === 'granted') {
      await this.savePreference(userId, 'allowed');
      return;
    }

    // 4. Show the native browser permission dialog
    try {
      const result = await Notification.requestPermission();
      const preference = result === 'granted' ? 'allowed' : 'not_allowed';
      await this.savePreference(userId, preference);
      console.log('[Notifications] User responded:', preference);
    } catch (err) {
      console.warn('[Notifications] Permission request failed:', err);
      await this.savePreference(userId, 'not_allowed');
    }
  }

  /**
   * Persist the notification preference to Firestore.
   */
  private async savePreference(userId: string, preference: 'allowed' | 'not_allowed'): Promise<void> {
    try {
      const userDocRef = doc(this.firestore, 'users', userId);
      await updateDoc(userDocRef, { notification_permission: preference });
      console.log('[Notifications] Saved preference for', userId, '→', preference);
    } catch (err) {
      console.error('[Notifications] Failed to save preference:', err);
    }
  }
}
