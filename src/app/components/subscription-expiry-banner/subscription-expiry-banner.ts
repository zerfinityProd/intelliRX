import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * SubscriptionExpiryBannerComponent
 *
 * A non-blocking top banner that warns the user their subscription is expiring.
 * Displayed by NavbarComponent when SubscriptionExpiryNotificationService
 * determines the notification window is active.
 *
 * The banner is dismissible per-session via the × button.
 * NavbarComponent persists the dismiss state through the service.
 */
@Component({
    selector: 'app-subscription-expiry-banner',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './subscription-expiry-banner.html',
    styleUrl: './subscription-expiry-banner.css'
})
export class SubscriptionExpiryBannerComponent {
    /** Number of days remaining — shown inline when provided. */
    @Input() daysRemaining: number | null = null;

    /** Emitted when the user clicks the × dismiss button. */
    @Output() dismissed = new EventEmitter<void>();

    get urgencyClass(): string {
        if (this.daysRemaining === null) return 'expiry-banner--warning';
        if (this.daysRemaining <= 2) return 'expiry-banner--critical';
        if (this.daysRemaining <= 5) return 'expiry-banner--urgent';
        return 'expiry-banner--warning';
    }

    get daysLabel(): string {
        if (this.daysRemaining === null) return '';
        if (this.daysRemaining === 0) return 'expires today';
        if (this.daysRemaining === 1) return 'expires tomorrow';
        return `expires in ${this.daysRemaining} day${this.daysRemaining !== 1 ? 's' : ''}`;
    }

    onDismiss(): void {
        this.dismissed.emit();
    }
}
