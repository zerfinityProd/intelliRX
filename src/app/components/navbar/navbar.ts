import { Component, HostListener, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthenticationService, User } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { ThemeService } from '../../services/themeService';
import { UIStateService } from '../../services/uiStateService';
import { ClinicContextService } from '../../services/clinicContextService';
import { FirestoreApiService } from '../../services/firestore-api.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent implements OnInit {
  @Input() showBack: boolean = false;
  @Input() pageTitle: string = '';
  @Output() backClick = new EventEmitter<void>();
  currentUser$: Observable<User | null>;
  isDarkTheme$: Observable<boolean>;
  uiState$: Observable<any>;
  isAdmin = false;

  constructor(
    private authService: AuthenticationService,
    private authorizationService: AuthorizationService,
    private themeService: ThemeService,
    private uiStateService: UIStateService,
    private clinicContextService: ClinicContextService,
    private firestoreApi: FirestoreApiService,
    private router: Router
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.isDarkTheme$ = this.themeService.isDarkTheme();
    this.uiState$ = this.uiStateService.getUIState();
  }

  async ngOnInit(): Promise<void> {
    const email = this.authService.currentUserValue?.email;
    if (email) {
      const role = await this.authorizationService.getUserRole(email);
      this.isAdmin = role === 'subscription_owner';
    }
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
    this.router.navigate(['/admin-dashboard']);
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
    if (subscriptionIds.length === 1) {
      chosenSubId = subscriptionIds[0];
    } else {
      // Prompt subscription selection with names
      const subOptions: Record<string, string> = {};
      for (const id of subscriptionIds) {
        try {
          const doc = await this.firestoreApi.getDocument('subscriptions', id);
          subOptions[id] = doc?.data?.['entity_name'] || doc?.data?.['name'] || id;
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
      chosenClinicId = clinicsInSub[0];
    } else {
      // Prompt clinic selection with names
      const clinicOptions: Record<string, string> = {};
      for (const id of clinicsInSub) {
        try {
          const doc = await this.firestoreApi.getDocument('clinics', id);
          clinicOptions[id] = doc?.data?.['name'] || id;
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

    // Apply context and reload
    this.clinicContextService.setClinicContext(chosenClinicId, chosenSubId);
    // Invalidate caches so fresh data loads
    this.authorizationService.invalidateRolesCache();
    // Navigate to home to re-initialize with new context
    if (this.router.url === '/home') {
      window.location.reload();
    } else {
      this.router.navigate(['/home']);
    }
  }
}