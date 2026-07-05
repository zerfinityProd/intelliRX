// src/app/components/subscription-management/subscription-management.ts
import {
  Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule, TitleCasePipe, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';

import { AuthenticationService } from '../../services/authenticationService';
import { AdminService } from '../../services/adminService';
import { FirestoreApiService } from '../../services/firestore-api.service';
import { ConfigService } from '../../services/configService';
import { PlanService } from '../../services/planService';

import { Subscription, BillingCycle, PlanDetail } from '../../models/subscription.model';
import { NavbarComponent } from '../navbar/navbar';

@Component({
  selector: 'app-subscription-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NavbarComponent, TitleCasePipe, DecimalPipe, DatePipe],
  templateUrl: './subscription-management.html',
  styleUrl: './subscription-management.css',
})
export class SubscriptionManagementComponent implements OnInit {

  // ── DI ────────────────────────────────────────────────────────────────────
  private auth        = inject(AuthenticationService);
  private adminService = inject(AdminService);
  private api          = inject(FirestoreApiService);
  private configService = inject(ConfigService);
  private planService  = inject(PlanService);
  private router       = inject(Router);
  private cdr          = inject(ChangeDetectorRef);

  // ── State ─────────────────────────────────────────────────────────────────
  isLoading   = true;
  isSaving    = false;

  subscription: (Subscription & { id: string }) | null = null;
  plans: PlanDetail[] = [];

  /** Currently highlighted plan key */
  selectedPlanKey = '';
  /** Billing cycle the user has toggled */
  billingCycle: BillingCycle = 'monthly';

  // ── Confirm dialog ────────────────────────────────────────────────────────
  confirmVisible = false;
  confirmPlan: PlanDetail | null = null;
  /** Total charge to display in confirm dialog */
  confirmTotal = 0;

  // ── Toast ─────────────────────────────────────────────────────────────────
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  toastVisible = false;
  private toastTimer: any;

  // ── Computed: max savings badges on cycle buttons ─────────────────────────
  get maxQuarterlySavings(): number {
    if (!this.plans.length) return 0;
    return Math.max(...this.plans.map(p => this.planService.getSavingsPercent(p, 'quarterly')));
  }
  get maxYearlySavings(): number {
    if (!this.plans.length) return 0;
    return Math.max(...this.plans.map(p => this.planService.getSavingsPercent(p, 'yearly')));
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await firstValueFrom(this.auth.authReady$.pipe(filter(r => r)));
    const email = (this.auth.currentUserValue?.email || '').toLowerCase().trim();

    try {
      await Promise.all([
        this.loadSubscription(email),
        this.loadPlans(),
      ]);
    } catch (e) {
      console.error('[SubscriptionManagement] Init error:', e);
    }

    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  private async loadSubscription(email: string): Promise<void> {
    try {
      // Query users by email to get subscription_id
      const userDocs = await this.api.runQuery('', {
        collectionId: 'users',
        filters: [{ field: 'email', op: '==', value: email }],
      });
      const userDoc = userDocs[0] ?? null;
      if (!userDoc) return;

      const subscriptionId: string = userDoc.data['subscription_id'] || '';
      if (!subscriptionId) return;

      const subDoc = await this.api.getDocument('subscriptions', subscriptionId);
      if (!subDoc) return;

      this.subscription = { ...(subDoc.data as Subscription), id: subDoc.id };

      // Normalize plan field
      const rawPlan = this.subscription.plan as any;
      if (typeof rawPlan === 'string') {
        this.subscription.plan = {
          name: rawPlan,
          limits: { max_clinics: 0, max_doctors: 0, max_receptionists: 0, max_appointments_per_day: 0 },
        };
      }

      // Pre-select the current plan
      this.selectedPlanKey = this.subscription.plan?.name || '';
      // Restore saved billing cycle or default to monthly
      this.billingCycle = this.subscription.billing_cycle || 'monthly';
    } catch (e) {
      console.error('[SubscriptionManagement] loadSubscription error:', e);
    }
  }

  private async loadPlans(): Promise<void> {
    this.plans = await this.planService.getPlans();
  }

  // ── UI actions ────────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  setBillingCycle(cycle: BillingCycle): void {
    this.billingCycle = cycle;
    this.cdr.detectChanges();
  }

  selectPlan(key: string): void {
    this.selectedPlanKey = key;
    this.cdr.detectChanges();
  }

  /** Called when the CTA button on a card is clicked */
  onCtaClick(plan: PlanDetail, event: Event): void {
    event.stopPropagation();
    if (this.isCurrentPlanAndCycle(plan.key)) return; // already on this plan+cycle
    this.openConfirm(plan);
  }

  // ── Confirm dialog ────────────────────────────────────────────────────────

  openConfirm(plan: PlanDetail): void {
    this.confirmPlan  = plan;
    this.confirmTotal = this.planService.getTotalCharge(plan, this.billingCycle);
    this.confirmVisible = true;
    this.cdr.detectChanges();
  }

  cancelConfirm(): void {
    this.confirmVisible = false;
    this.cdr.detectChanges();
  }

  async applyPlanChange(): Promise<void> {
    if (!this.confirmPlan || !this.subscription) return;
    this.isSaving = true;
    this.cdr.detectChanges();

    try {
      const planKey = this.confirmPlan.key;

      // Fetch fresh plan doc to get limits
      const planDoc = await this.api.getDocument('plans', planKey);
      const limits = {
        max_clinics:             Number(planDoc?.data['max_clinics'] ?? planDoc?.data['max_clinincs'] ?? 0),
        max_doctors:             Number(planDoc?.data['max_doctors'] ?? 0),
        max_receptionists:       Number(planDoc?.data['max_receptionists'] ?? planDoc?.data['max_receptionist'] ?? 0),
        max_appointments_per_day: Number(planDoc?.data['max_appointments_per_day'] ?? 0),
      };

      // Compute new expiry based on billing cycle duration
      // monthly = 30 days, quarterly = 90 days, yearly = 365 days
      const cycleDays: Record<string, number> = {
        monthly: 30,
        quarterly: 90,
        yearly: 365,
      };
      const billingDays = cycleDays[this.billingCycle] ?? 30;

      // Also read plan's validity_days (may differ from billing cycle for trial/demo plans)
      const planValidityDays = await this.configService.getPlanValidityDays(planKey);

      // Use the billing cycle duration; if the plan has a shorter validity (e.g. demo), use that
      const validityDays = planValidityDays < 60 ? planValidityDays : billingDays;

      const expiry = new Date();
      expiry.setDate(expiry.getDate() + validityDays);
      const valid_until = expiry.toISOString();

      // Persist plan change + billing_cycle to Firestore
      const newPlan = { name: planKey, limits };
      await this.adminService.updateSubscription(this.subscription.id, {
        plan: newPlan,
        valid_until,
        billing_cycle: this.billingCycle,
        updated_at: new Date().toISOString(),
      });

      // Update local state
      this.subscription = {
        ...this.subscription,
        plan: newPlan,
        valid_until,
        billing_cycle: this.billingCycle,
      };
      this.selectedPlanKey = planKey;
      this.confirmVisible = false;

      const expiryStr = expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      this.showToast(`Switched to ${this.confirmPlan.label} (${this.billingCycle}) — valid until ${expiryStr}`, 'success');
    } catch (e: any) {
      console.error('[SubscriptionManagement] applyPlanChange error:', e);
      this.showToast('Failed to apply plan change: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  /** True if this plan key matches the current subscription's plan */
  isCurrentPlan(planKey: string): boolean {
    return this.subscription?.plan?.name === planKey;
  }

  /**
   * True if this plan AND the currently selected billing cycle match
   * what is already stored in the subscription — used to disable the CTA.
   */
  isCurrentPlanAndCycle(planKey: string): boolean {
    return this.isCurrentPlan(planKey) && this.subscription?.billing_cycle === this.billingCycle;
  }

  /** Per-month price for the selected billing cycle */
  getPricePerMonth(plan: PlanDetail): number {
    switch (this.billingCycle) {
      case 'quarterly': return plan.quarterly_charges;
      case 'yearly':    return plan.yearly_charges;
      default:          return plan.monthly_charges;
    }
  }

  /** Total billed amount for the selected cycle */
  getTotalCharge(plan: PlanDetail): number {
    return this.planService.getTotalCharge(plan, this.billingCycle);
  }

  /** Savings % vs monthly billing (0 for monthly) */
  getSavings(plan: PlanDetail): number {
    return this.planService.getSavingsPercent(plan, this.billingCycle);
  }

  /** CTA button label */
  getCtaLabel(planKey: string): string {
    if (this.isCurrentPlanAndCycle(planKey)) return 'Current Plan';
    if (this.isCurrentPlan(planKey))         return 'Change Billing Cycle';

    // Compare by monthly price: higher price = upgrade, lower price = downgrade
    const targetPlan  = this.plans.find(p => p.key === planKey);
    const currentPlan = this.plans.find(p => this.isCurrentPlan(p.key));
    if (!targetPlan || !currentPlan) return 'Select Plan';

    return targetPlan.monthly_charges > currentPlan.monthly_charges ? 'Upgrade' : 'Downgrade';
  }

  // ── Toast helper ──────────────────────────────────────────────────────────
  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    this.cdr.detectChanges();
    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
      this.cdr.detectChanges();
    }, 3500);
  }
}
