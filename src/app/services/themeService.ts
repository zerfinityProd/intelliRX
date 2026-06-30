import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthenticationService } from './authenticationService';
import { AuthorizationService } from './authorizationService';
import { ConfigService } from './configService';
import { ClinicContextService } from './clinicContextService';

/**
 * Manages application theme (light/dark mode).
 * Persists to Firestore via ConfigService at:
 *   users/{userId}/config/settings → preferences.theme
 * Falls back to system preference before Firebase loads.
 */
@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private static readonly STORAGE_KEY = 'intellirx-theme';
    private readonly isDarkTheme$ = new BehaviorSubject<boolean>(this.loadThemeFromLocal());

    private authService = inject(AuthenticationService);
    private authorizationService = inject(AuthorizationService);
    private configService = inject(ConfigService);
    private clinicContext = inject(ClinicContextService);

    /** Cached user doc ID so we don't re-fetch on every toggle */
    private resolvedUserId: string | null = null;

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
     * Resolve the Firestore user document ID for the current user.
     * Returns null if user context is not ready.
     */
    private async resolveUserId(): Promise<string | null> {
        if (this.resolvedUserId) return this.resolvedUserId;

        const email = this.authService.currentUserValue?.email;
        if (!email) return null;

        try {
            const userId = await this.authorizationService.getUserId(email);
            this.resolvedUserId = userId;
            return userId;
        } catch {
            return null;
        }
    }

    /**
     * Load theme from Firestore for the logged-in user.
     * Falls back to localStorage / system preference.
     * Call this once after login.
     */
    async loadThemeFromFirebase(): Promise<void> {
        const userId = await this.resolveUserId();
        if (!userId) return;

        const subId = this.clinicContext.getSubscriptionId() ?? undefined;
        const clinicId = this.clinicContext.getSelectedClinicId() ?? undefined;

        try {
            const config = await this.configService.getDoctorConfig(userId, subId, clinicId);

            if (config?.preferences?.theme) {
                const isDark = config.preferences.theme === 'dark';
                this.isDarkTheme$.next(isDark);
                this.applyTheme(isDark);
                return;
            }

            // No theme saved yet — persist current default to Firestore
            const currentTheme = this.isDarkTheme$.value ? 'dark' : 'light';
            await this.saveThemeToConfig(currentTheme);
        } catch {
            // Keep the local/system default — Firestore is unavailable
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
     * Load theme from system preference (synchronous, used at startup)
     */
    private loadThemeFromLocal(): boolean {
        const stored = localStorage.getItem(ThemeService.STORAGE_KEY);
        if (stored === 'dark') return true;
        if (stored === 'light') return false;
        // No saved preference — fall back to OS system preference
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
        // Persist to localStorage for instant load on next refresh
        localStorage.setItem(ThemeService.STORAGE_KEY, isDark ? 'dark' : 'light');
    }

    /**
     * Persist theme preference to Firestore via ConfigService
     */
    private persistTheme(isDark: boolean): void {
        const theme = isDark ? 'dark' : 'light';
        this.saveThemeToConfig(theme).catch(() => {
            // Silently ignore — theme is already applied locally
        });
    }

    /**
     * Write theme to:
     * configurations/sub_{subId}/clinics/{clinicId}/users/{userId} → preferences.theme
     */
    private async saveThemeToConfig(theme: string): Promise<void> {
        const userId = await this.resolveUserId();
        if (!userId) return;

        const subId = this.clinicContext.getSubscriptionId() ?? undefined;
        const clinicId = this.clinicContext.getSelectedClinicId() ?? undefined;

        await this.configService.setDoctorConfig(
            userId,
            { preferences: { theme: theme as 'light' | 'dark' } },
            subId,
            clinicId
        );
    }
}