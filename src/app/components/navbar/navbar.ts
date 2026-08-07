import { Component, HostListener, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthenticationService, User } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { ThemeService } from '../../services/themeService';
import { UIStateService } from '../../services/uiStateService';
import { ClinicContextService } from '../../services/clinicContextService';
import { ClinicRepository } from '../../repositories/interfaces/clinic.repository';
import { SubscriptionRepository } from '../../repositories/interfaces/subscription.repository';
import { SubscriptionExpiryNotificationService } from '../../services/subscriptionExpiryNotificationService';
import { SubscriptionExpiryBannerComponent } from '../subscription-expiry-banner/subscription-expiry-banner';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, SubscriptionExpiryBannerComponent],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input() showBack: boolean = false;
  @Input() pageTitle: string = '';
  @Output() backClick = new EventEmitter<void>();
  currentUser$: Observable<User | null>;
  isDarkTheme$: Observable<boolean>;
  uiState$: Observable<any>;
  isAdmin = false;
  isDoctor = false;
  isReceptionist = false;
  showSwitchClinic = false;
  currentClinicName = '';
  currentClinicAddress = '';
  /** Whether the subscription-expiring banner should be visible. */
  showExpiryBanner = false;
  /** Days until expiry — passed to the banner for urgency styling/label. */
  expiryDaysRemaining: number | null = null;
  private contextSub?: Subscription;

  constructor(
    private authService: AuthenticationService,
    private authorizationService: AuthorizationService,
    private themeService: ThemeService,
    private uiStateService: UIStateService,
    private clinicContextService: ClinicContextService,
    private clinicRepo: ClinicRepository,
    private subscriptionRepo: SubscriptionRepository,
    private expiryNotificationService: SubscriptionExpiryNotificationService,
    private router: Router
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.isDarkTheme$ = this.themeService.isDarkTheme();
    this.uiState$ = this.uiStateService.getUIState();
  }

  /** True when the current route is the admin dashboard or any admin sub-page */
  get isOnAdminDashboard(): boolean {
    const url = this.router.url;
    return url.startsWith('/admin/dashboard')
      || url.startsWith('/admin-dashboard')
      || url.startsWith('/admin/subscription');
  }

  /**
   * Reception Dashboard button should only appear when the user has the
   * receptionist role but NOT the doctor role.
   *
   * Rationale: doctor role already includes all reception-level permissions,
   * so when both roles are assigned the doctor dashboard is sufficient.
   * Showing a separate Reception Dashboard button alongside Doctor Dashboard
   * is redundant and confusing.
   *
   * Matrix:
   *  admin only                → Admin Dashboard only
   *  admin + doctor            → Admin Dashboard + Doctor Dashboard
   *  admin + reception         → Admin Dashboard + Reception Dashboard
   *  admin + doctor + reception→ Admin Dashboard + Doctor Dashboard
   *  doctor only               → Doctor Dashboard
   *  reception only            → Reception Dashboard
   */
  get showReceptionDashboard(): boolean {
    return this.isReceptionist && !this.isDoctor;
  }

  async ngOnInit(): Promise<void> {
    // Wait for Firebase auth to restore session before reading the user's email.
    // On a hard page refresh currentUserValue is null until onAuthStateChanged fires,
    // so skipping this wait causes role lookups to be silently skipped and isAdmin /
    // isDoctor to stay false — hiding the Admin Dashboard button.
    await firstValueFrom(this.authService.authReady$.pipe(filter(ready => ready)));

    const email = this.authService.currentUserValue?.email;
    if (email) {
      const role = await this.authorizationService.getUserRole(email);
      const globalRoles = await this.authorizationService.getUserGlobalRoles(email);
      this.isAdmin = role === 'subscription_owner' || globalRoles.includes('admin') || globalRoles.includes('z_admin');

      // Fallback: scan all subscriptions for owner_email match.
      // getUserSubscriptionId() may return a wrong subscription when the user's
      // clinic_users doc has a stale clinic_id from a different sub — so we search
      // ALL subscriptions directly instead of relying on the assignment-derived sub ID.
      if (!this.isAdmin) {
        try {
          this.isAdmin = await this.authorizationService.isSubscriptionOwner(email);
        } catch { /* non-critical — silently skip */ }
      }

      this.isDoctor = globalRoles.includes('doctor');
      this.isReceptionist = globalRoles.includes('receptionist') || globalRoles.includes('recep');

      // Show "Switch Clinic" only if user has more than 1 clinic or subscription
      const assignments = await this.authorizationService.getUserAssignments(email);
      const uniqueSubs = new Set(assignments.map(a => a.subscriptionId));
      const uniqueClinics = new Set(assignments.map(a => a.clinicId));
      this.showSwitchClinic = uniqueSubs.size > 1 || uniqueClinics.size > 1;
    }

    // Load clinic name and react to context changes (e.g. after Switch Clinic)
    this.contextSub = this.clinicContextService.context$.subscribe(async ctx => {
      if (ctx.clinicId) {
        try {
          const summary = await this.clinicRepo.getClinicSummary(ctx.clinicId);
          this.currentClinicName = summary?.name || '';
          this.currentClinicAddress = summary?.address || '';
        } catch {
          this.currentClinicName = '';
          this.currentClinicAddress = '';
        }
      } else {
        this.currentClinicName = '';
        this.currentClinicAddress = '';
      }

      // Re-check expiry whenever the subscription context changes
      // (e.g. after Switch Clinic resolves to a different subscription)
      void this.checkExpiryNotification(ctx.subscriptionId);
    });
  }

  ngOnDestroy(): void {
    this.contextSub?.unsubscribe();
  }

  /**
   * Checks whether the subscription-expiring banner should be shown.
   * Called once on init (via context$ subscription) and re-checked on
   * clinic/subscription switches.
   */
  private async checkExpiryNotification(subscriptionId: string | null | undefined): Promise<void> {
    const subId = subscriptionId ?? null;
    const shouldShow = await this.expiryNotificationService.shouldShowExpiryNotification(subId);
    this.showExpiryBanner = shouldShow;
    if (shouldShow) {
      this.expiryDaysRemaining = await this.expiryNotificationService.getDaysRemaining(subId);
    }
  }

  /** Called by the banner's (dismissed) output binding. */
  onExpiryBannerDismissed(): void {
    this.expiryNotificationService.markSessionDismissed();
    this.showExpiryBanner = false;
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  goToLeaves(): void {
    this.uiStateService.toggleUserMenu(); // close menu
    this.router.navigate(['/my-leaves']);
  }

  goToAdminDashboard(): void {
    this.uiStateService.toggleUserMenu(); // close menu
    this.router.navigate(['/admin/dashboard']);
  }

  goToDoctorDashboard(): void {
    this.uiStateService.toggleUserMenu(); // close menu
    this.router.navigate(['/home']);
  }

  goToReceptionDashboard(): void {
    this.uiStateService.toggleUserMenu(); // close menu
    this.router.navigate(['/home']);
  }

  /** Toggles between admin dashboard and doctor dashboard when logo is clicked by an admin */
  toggleDashboard(): void {
    if (this.isOnAdminDashboard) {
      this.router.navigate(['/home']);
    } else {
      this.router.navigate(['/admin/dashboard']);
    }
  }

  toggleUserMenu(): void {
    this.uiStateService.toggleUserMenu();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.nav-avatar-wrap')) {
      this.uiStateService.closeUserMenu();
    }
  }

  goBack(): void {
    if (this.backClick.observed) {
      this.backClick.emit();
    } else {
      this.router.navigate(['/home']);
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear session dismiss so expiry banner re-evaluates on next login
      this.expiryNotificationService.clearSessionDismiss();
      await this.authService.logout();
      this.themeService.setTheme(false); // reset to light for next user
      this.uiStateService.resetUIState();
      this.clinicContextService.clear();
      this.router.navigate(['/app/login']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  async switchClinic(): Promise<void> {
    this.uiStateService.toggleUserMenu(); // close dropdown
    const email = this.authService.currentUserValue?.email;
    if (!email) return;

    const assignments = await this.authorizationService.getUserAssignments(email);
    if (assignments.length === 0) return;

    const { default: Swal } = await import('sweetalert2');

    // Get unique subscriptions
    const subscriptionIds = [...new Set(assignments.map(a => a.subscriptionId))];

    let chosenSubId: string;

    // ── Case 2: Only 1 subscription — skip subscription picker ──
    if (subscriptionIds.length === 1) {
      chosenSubId = subscriptionIds[0];
    } else {
      // ── Case 3: Multiple subscriptions — ask to choose subscription first ──
      const subOptions: Record<string, string> = {};
      for (const id of subscriptionIds) {
        try {
          const summary = await this.subscriptionRepo.getSubscriptionSummary(id);
          subOptions[id] = summary?.name || id;
        } catch {
          subOptions[id] = id;
        }
      }
      const subResult = await Swal.fire({
        title: 'Select Organisation',
        text: 'Which organisation do you want to switch to?',
        input: 'select',
        inputOptions: subOptions,
        inputPlaceholder: 'Select an organisation',
        inputValue: this.clinicContextService.getSubscriptionId() || '',
        showCancelButton: true,
        confirmButtonText: 'Continue',
        cancelButtonText: 'Cancel',
        allowOutsideClick: true,
        confirmButtonColor: '#148D9E'
      });
      if (subResult.isDismissed) return;
      chosenSubId = String(subResult.value ?? subscriptionIds[0]);
    }

    // Get clinics in chosen subscription
    const clinicsInSub = assignments
      .filter(a => a.subscriptionId === chosenSubId)
      .map(a => a.clinicId);

    let chosenClinicId: string;
    if (clinicsInSub.length === 1) {
      // Only 1 clinic in this subscription — auto-select it
      chosenClinicId = clinicsInSub[0];
    } else {
      // Multiple clinics — prompt user to pick one
      const clinicOptions: Record<string, string> = {};
      for (const id of clinicsInSub) {
        try {
          const summary = await this.clinicRepo.getClinicSummary(id);
          const name = summary?.name || id;
          const addr = summary?.address;
          clinicOptions[id] = addr ? `${name} — ${addr}` : name;
        } catch {
          clinicOptions[id] = id;
        }
      }
      const clinicResult = await Swal.fire({
        title: 'Select Clinic',
        text: 'Which clinic do you want to switch to?',
        input: 'select',
        inputOptions: clinicOptions,
        inputPlaceholder: 'Select a clinic',
        inputValue: this.clinicContextService.getSelectedClinicId() || '',
        showCancelButton: true,
        confirmButtonText: 'Switch',
        cancelButtonText: 'Cancel',
        allowOutsideClick: true,
        confirmButtonColor: '#148D9E'
      });
      if (clinicResult.isDismissed) return;
      chosenClinicId = String(clinicResult.value ?? clinicsInSub[0]);
    }

    // Don't reload if user selected the same clinic they're already on
    const currentClinicId = this.clinicContextService.getSelectedClinicId();
    const currentSubId = this.clinicContextService.getSubscriptionId();
    if (chosenClinicId === currentClinicId && chosenSubId === currentSubId) {
      return;
    }

    // Apply new context and broadcast a clinic-switch event.
    // HomeComponent subscribes to clinicSwitch$ and reloads its data in place —
    // no full page reload or navigation needed.
    this.clinicContextService.setClinicContext(chosenClinicId, chosenSubId, true);
    this.authorizationService.invalidateRolesCache();
  }
}