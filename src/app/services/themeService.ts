import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { AuthenticationService } from './authenticationService';

/**
 * Manages application theme (light/dark mode).
 * Persists to Firestore under users/{uid}/preferences.theme
 * Falls back to system preference before Firebase loads.
 */
@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly isDarkTheme$ = new BehaviorSubject<boolean>(this.loadThemeFromLocal());

    private firebaseService = inject(FirebaseService);
    private authService = inject(AuthenticationService);

    /**
     * Observable that emits when theme changes
     */
    isDarkTheme(): Observable<boolean> {
        return this.isDarkTheme$.asObservable();
    }

    /**
     * Get current theme state synchronously
     */
    getCurrentTheme(): boolean {
        return this.isDarkTheme$.value;
    }

    /**
     * Load theme from Firebase for the logged-in user.
     * Falls back to localStorage / system preference.
     * Call this once after login.
     */
    async loadThemeFromFirebase(): Promise<void> {
        const uid = this.authService.getCurrentUserId();
        if (!uid) return;
        const prefs = await this.firebaseService.getUserPreferences(uid);
        if (prefs?.theme) {
            // Firebase has a saved preference — apply it
            const isDark = prefs.theme === 'dark';
            this.isDarkTheme$.next(isDark);
            this.applyTheme(isDark);
        } else {
            // No preference saved yet — persist current theme (local/system default) to Firebase
            const currentTheme = this.isDarkTheme$.value ? 'dark' : 'light';
            await this.firebaseService.saveUserPreferences(uid, { theme: currentTheme });
        }
    }

    /**
     * Toggle between light and dark themes
     */
    toggleTheme(): void {
        const newTheme = !this.isDarkTheme$.value;
        this.isDarkTheme$.next(newTheme);
        this.applyTheme(newTheme);
        this.persistTheme(newTheme);
    }

    /**
     * Set theme to specific mode
     */
    setTheme(isDark: boolean): void {
        this.isDarkTheme$.next(isDark);
        this.applyTheme(isDark);
        this.persistTheme(isDark);
    }

    /**
     * Load theme from system preference (synchronous, used at startup before Firebase loads)
     */
    private loadThemeFromLocal(): boolean {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    /**
     * Apply theme to DOM
     */
    private applyTheme(isDark: boolean): void {
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    /**
     * Persist theme preference to Firestore
     */
    private persistTheme(isDark: boolean): void {
        const theme = isDark ? 'dark' : 'light';
        const uid = this.authService.getCurrentUserId();
        if (uid) {
            this.firebaseService.saveUserPreferences(uid, { theme });
        }
    }
}