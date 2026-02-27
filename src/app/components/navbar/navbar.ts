import { Component, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthenticationService, User } from '../../services/authenticationService';
import { ThemeService } from '../../services/themeService';
import { UIStateService } from '../../services/uiStateService';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  @Input() showBack: boolean = false;
  @Input() pageTitle: string = '';
  currentUser$: Observable<User | null>;
  isDarkTheme$: Observable<boolean>;
  uiState$: Observable<any>;

  constructor(
    private authService: AuthenticationService,
    private themeService: ThemeService,
    private uiStateService: UIStateService,
    private router: Router
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.isDarkTheme$ = this.themeService.isDarkTheme();
    this.uiState$ = this.uiStateService.getUIState();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
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
    this.router.navigate(['/home']);
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}