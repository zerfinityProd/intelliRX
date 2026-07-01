import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-subscription-expired',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription-expired.html',
  styleUrl: './subscription-expired.css',
})
export class SubscriptionExpiredComponent implements OnInit {
  private router = inject(Router);

  /** Role passed from the login flow via router state */
  role: string = '';

  get isAdmin(): boolean {
    return this.role === 'admin' || this.role === 'subscription_owner';
  }

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation();
    this.role = (nav?.extras?.state?.['role'] as string) || '';
  }

  goToLogin(): void {
    this.router.navigate(['/app/login']);
  }
}
