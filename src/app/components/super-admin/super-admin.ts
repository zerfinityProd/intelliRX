import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FirestoreApiService } from '../../services/firestore-api.service';
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
    private api: FirestoreApiService,
    private auth: AuthenticationService
  ) {}

  async ngOnInit() {
    await this.loadSubscriptions();
  }

  async loadSubscriptions() {
    try {
      // Just fetch all subscriptions since we are Super Admin
      const docs = await this.api.runQuery('', {
        collectionId: 'subscriptions'
      });
      this.subscriptions = docs.map((d: any) => ({
        id: d.id,
        ...d.data
      }));
    } catch (e) {
      console.error('Failed to load subscriptions', e);
    }
  }

  async updateSubscriptionStatus(subId: string, status: string) {
    if (!confirm(`Are you sure you want to change status to ${status}?`)) return;
    try {
      await this.api.updateDocument('subscriptions', subId, { status, updated_at: new Date().toISOString() });
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
