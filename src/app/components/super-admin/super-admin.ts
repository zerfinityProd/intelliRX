import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdminService';
import { AuthenticationService } from '../../services/authenticationService';

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './super-admin.html',
  styleUrl: './super-admin.css'
})
export class SuperAdminComponent implements OnInit {
  subscriptions: any[] = [];

  constructor(
    private router: Router,
    private superAdminService: SuperAdminService,
    private auth: AuthenticationService
  ) {}

  async ngOnInit() {
    await this.loadSubscriptions();
  }

  async loadSubscriptions() {
    try {
      // Just fetch all subscriptions since we are Super Admin
      const subs = await this.superAdminService.getAllSubscriptions();
      this.subscriptions = subs.map((s: any) => ({ id: s.id, ...s }));
    } catch (e) {
      console.error('Failed to load subscriptions', e);
    }
  }

  async updateSubscriptionStatus(subId: string, status: string) {
    if (!confirm(`Are you sure you want to change status to ${status}?`)) return;
    try {
      await this.superAdminService.updateSubscriptionStatus(subId, status);
      await this.loadSubscriptions();
    } catch (e) {
      alert('Failed to update subscription status');
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/app/login']);
  }
}
