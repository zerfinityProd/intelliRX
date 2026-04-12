import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { AuthenticationService } from './authenticationService';
import { ClinicContextService } from './clinicContextService';
import { normalizeEmail } from '../utilities/normalize-email';

/**
 * Manages application theme (light/dark mode).
 * Persists to Firestore under:
 *   subscriptions/{subId}/clinics/{clinicId}/users/{email}.preferences.theme
 * Falls back to system preference before Firebase loads.
 */
@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly isDarkTheme$ = new BehaviorSubject<boolean>(this.loadThemeFromLocal());

    private firestore = inject(Firestore);
    private authService = inject(AuthenticationService);
    private clinicContext = inject(ClinicContextService);

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
     * Build the Firestore path to the current user's clinic user doc.
     * Returns null if context is not ready.
     */
    private getUserDocPath(): string | null {
        const subId = this.clinicContext.getSubscriptionId();
        const clinicId = this.clinicContext.getSelectedClinicId();
        const email = this.authService.currentUserValue?.email;
        if (!subId || !clinicId || !email) return null;
        const normalized = normalizeEmail(email);
        return `subscriptions/${subId}/clinics/${clinicId}/users/${normalized}`;
    }

    /**
     * Load theme from Firestore for the logged-in user.
     * Falls back to localStorage / system preference.
     * Call this once after login.
     */
    async loadThemeFromFirebase(): Promise<void> {
        const path = this.getUserDocPath();
        if (!path) return;

        try {
            const userDocRef = doc(this.firestore, path);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const data = userDoc.data();
                const theme = data?.['preferences']?.['theme'];
                if (theme) {
                    const isDark = theme === 'dark';
                    this.isDarkTheme$.next(isDark);
                    this.applyTheme(isDark);
                    return;
                }
            }

            // No theme saved yet — persist current default to Firestore
            const currentTheme = this.isDarkTheme$.value ? 'dark' : 'light';
            await this.saveThemeToFirestore(currentTheme);
        } catch (error) {
            console.warn('Failed to load theme from Firestore:', error);
            // Keep the local/system default
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
     * Persist theme preference to Firestore (on the clinic user doc)
     */
    private persistTheme(isDark: boolean): void {
        const theme = isDark ? 'dark' : 'light';
        this.saveThemeToFirestore(theme).catch(err => {
            console.warn('Failed to save theme to Firestore:', err);
        });
    }

    /**
     * Write theme to: subscriptions/{subId}/clinics/{clinicId}/users/{email}.preferences.theme
     */
    private async saveThemeToFirestore(theme: string): Promise<void> {
        const path = this.getUserDocPath();
        if (!path) return;

        const userDocRef = doc(this.firestore, path);
        await setDoc(userDocRef, {
            preferences: { theme }
        }, { merge: true });
    }
}