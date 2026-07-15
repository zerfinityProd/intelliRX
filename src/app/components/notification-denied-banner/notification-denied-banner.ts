import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Informational banner shown when Notification.permission === 'denied'.
 *
 * Browsers do not allow re-requesting permission once blocked, so we
 * show clear instructions on how to re-enable from browser settings.
 * The banner is dismissible for the current session only.
 */
@Component({
  selector: 'app-notification-denied-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-denied-banner.html',
  styleUrl: './notification-denied-banner.css'
})
export class NotificationDeniedBannerComponent {
  /** Emitted when the user dismisses the banner. */
  @Output() dismissed = new EventEmitter<void>();

  onDismiss(): void {
    this.dismissed.emit();
  }
}
