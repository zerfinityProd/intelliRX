import { Component, HostListener, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthenticationService, User } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { ThemeService } from '../../services/themeService';
import { UIStateService } from '../../services/uiStateService';
import { ClinicContextService } from '../../services/clinicContextService';

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
}