// src/app/services/notificationService.ts
import { Injectable, inject } from '@angular/core';
import { UserRepository } from '../repositories/interfaces/user.repository';

/**
 * Handles browser push notification permission requests and persists
 * the user's choice in the users collection via UserRepository.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private userRepo = inject(UserRepository);

  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  get isGranted(): boolean {
    return this.isSupported && Notification.permission === 'granted';
  }

  async promptIfNeeded(userId: string): Promise<void> {
    if (!this.isSupported || !userId) return;

    let storedPref: string | null = null;
    try {
      const result = await this.userRepo.getUserById(userId);
      if (result) {
        storedPref = (result as any)['notification_permission'] || null;
      }
    } catch {
      return;
    }

    if (Notification.permission === 'granted' && storedPref !== 'allowed') {
      await this.savePreference(userId, 'allowed');
      return;
    }
    if (Notification.permission === 'denied') {
      if (storedPref !== 'not_allowed') await this.savePreference(userId, 'not_allowed');
      return;
    }

    if (storedPref === 'allowed' || storedPref === 'not_allowed') return;

    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        await this.savePreference(userId, 'allowed');
      } else if (result === 'denied') {
        await this.savePreference(userId, 'not_allowed');
      }
    } catch (err) {
      console.warn('[Notifications] Permission request failed:', err);
    }
  }

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

  private async savePreference(userId: string, preference: 'allowed' | 'not_allowed'): Promise<void> {
    try {
      await this.userRepo.updateUser(userId, { notification_permission: preference } as any);
    } catch (err) {
      console.error('[Notifications] Failed to save preference:', err);
    }
  }
}
