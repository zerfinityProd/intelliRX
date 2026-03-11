import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/themeService';
import { AuthenticationService } from './services/authenticationService';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'IntelliRX - Patient Management';
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthenticationService);

  // pagehide handler reference kept so it can be removed on destroy
  private readonly onPageHide = () => {
    // Allow browser to cache the page for instant back/forward navigation.
    // Firebase Auth keeps an internal unload listener; registering pagehide
    // instead signals to the browser that bfcache is not blocked by this app.
    // No teardown needed — Angular services survive within the same session.
  };

  ngOnInit(): void {
    // Apply local theme immediately for fast startup
    this.themeService.setTheme(this.themeService.getCurrentTheme());

    // Once auth is ready and user is logged in, sync theme from Firebase
    this.authService.authReady$.pipe(
      filter(ready => ready),
      take(1)
    ).subscribe(() => {
      if (this.authService.isLoggedIn()) {
        this.themeService.loadThemeFromFirebase();
      }
    });

    // Register pagehide instead of unload to keep bfcache eligibility
    window.addEventListener('pagehide', this.onPageHide);
  }

  ngOnDestroy(): void {
    window.removeEventListener('pagehide', this.onPageHide);
  }
}