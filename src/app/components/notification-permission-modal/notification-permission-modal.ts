import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notificationService';

/**
 * Custom notification opt-in modal.
 *
 * Shown after login when the browser permission is still 'default'
 * and the user hasn't permanently opted out.
 *
 * Behaviour
 * ─────────
 * • "Enable Notifications" — calls NotificationService.requestPermission()
 *   (satisfies browser user-gesture requirement because it is wired to a
 *   button click). On grant → saves to Firestore and emits closed.
 *   On deny (user clicked Block in the native dialog) → saves not_allowed
 *   to Firestore and emits closed.
 *
 * • "Not Now" — marks the session as dismissed (sessionStorage only,
 *   nothing persisted to Firestore) and emits closed.
 *   The modal will re-appear on the user's next login.
 */
@Component({
  selector: 'app-notification-permission-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-permission-modal.html',
  styleUrl: './notification-permission-modal.css'
})
export class NotificationPermissionModalComponent {
  /** Firestore user document ID — needed to persist the user's choice. */
  @Input({ required: true }) userId!: string;

  /** Emitted when the modal should be removed from the DOM. */
  @Output() closed = new EventEmitter<void>();

  private readonly notificationService = inject(NotificationService);

  isRequesting = false;
  /** Set after the native browser prompt resolves, to show a brief result. */
  resultState: 'granted' | 'denied' | null = null;

  async onEnable(): Promise<void> {
    if (this.isRequesting) return;
    this.isRequesting = true;

    const result = await this.notificationService.requestPermission();

    if (result === 'granted') {
      await this.notificationService.markGranted(this.userId);
      this.resultState = 'granted';
      // Brief success message, then close.
      setTimeout(() => this.close(), 1400);
    } else if (result === 'denied') {
      await this.notificationService.markDenied(this.userId);
      this.resultState = 'denied';
      // Brief info message, then close.
      setTimeout(() => this.close(), 2000);
    } else {
      // 'default' — browser dismissed without a choice (rare edge case).
      this.close();
    }

    this.isRequesting = false;
  }

  onNotNow(): void {
    this.notificationService.markSessionDismissed();
    this.close();
  }

  private close(): void {
    this.closed.emit();
  }
}
