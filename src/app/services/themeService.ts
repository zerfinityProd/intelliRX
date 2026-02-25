import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Manages application theme (light/dark mode) with localStorage persistence
 * Handles DOM updates and observability for theme state changes
 */
@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly isDarkTheme$ = new BehaviorSubject<boolean>(this.loadTheme());

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
     * Load theme from localStorage or system preference
     */
    private loadTheme(): boolean {
        const saved = localStorage.getItem('intellirx-theme');
        if (saved === 'dark') return true;
        if (saved === 'light') return false;
        // Fallback to system preference
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
     * Persist theme preference to localStorage
     */
    private persistTheme(isDark: boolean): void {
        localStorage.setItem('intellirx-theme', isDark ? 'dark' : 'light');
    }
}
