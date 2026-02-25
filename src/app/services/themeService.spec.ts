import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './themeService';

describe('ThemeService', () => {
    let service: ThemeService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(ThemeService);
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
    });

    afterEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
    });

    describe('Theme Loading', () => {
        it('should load dark theme from localStorage', () => {
            localStorage.setItem('intellirx-theme', 'dark');
            const newService = new ThemeService();
            expect(newService.getCurrentTheme()).toBe(true);
        });

        it('should load light theme from localStorage', () => {
            localStorage.setItem('intellirx-theme', 'light');
            const newService = new ThemeService();
            expect(newService.getCurrentTheme()).toBe(false);
        });

        it('should default to light theme if not in localStorage', () => {
            const newService = new ThemeService();
            expect(newService.getCurrentTheme()).toBeFalsy();
        });
    });

    describe('Theme Toggle', () => {
        it('should toggle theme from light to dark', () => {
            expect(service.getCurrentTheme()).toBe(false);
            service.toggleTheme();
            expect(service.getCurrentTheme()).toBe(true);
        });

        it('should toggle theme from dark to light', () => {
            service.setTheme(true);
            service.toggleTheme();
            expect(service.getCurrentTheme()).toBe(false);
        });

        it('should apply dark theme to DOM', () => {
            service.toggleTheme();
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });

        it('should remove dark theme from DOM on toggle back', () => {
            service.toggleTheme();
            service.toggleTheme();
            expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
        });
    });

    describe('Theme Persistence', () => {
        it('should persist dark theme to localStorage', () => {
            service.setTheme(true);
            expect(localStorage.getItem('intellirx-theme')).toBe('dark');
        });

        it('should persist light theme to localStorage', () => {
            service.setTheme(true);
            service.setTheme(false);
            expect(localStorage.getItem('intellirx-theme')).toBe('light');
        });

        it('should persist theme on toggle', () => {
            service.toggleTheme();
            expect(localStorage.getItem('intellirx-theme')).toBe('dark');
        });
    });

    describe('Theme Observable', () => {
        it('should emit current theme on subscription', () => {
            const subscription = service.isDarkTheme().subscribe(isDark => {
                expect(isDark).toBe(false);
            });
            subscription.unsubscribe();
        });

        it('should emit new value on theme change', () => {
            const emittedValues: boolean[] = [];
            const subscription = service.isDarkTheme().subscribe(isDark => {
                emittedValues.push(isDark);
            });

            service.toggleTheme();

            expect(emittedValues.includes(true)).toBe(true);
            subscription.unsubscribe();
        });
    });

    describe('Direct Theme Setting', () => {
        it('should set theme to dark', () => {
            service.setTheme(true);
            expect(service.getCurrentTheme()).toBe(true);
        });

        it('should set theme to light', () => {
            service.setTheme(true);
            service.setTheme(false);
            expect(service.getCurrentTheme()).toBe(false);
        });

        it('should apply dark theme to DOM when set', () => {
            service.setTheme(true);
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });

        it('should remove dark theme from DOM when set to light', () => {
            service.setTheme(true);
            service.setTheme(false);
            expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should handle multiple consecutive toggles', () => {
            service.toggleTheme();
            service.toggleTheme();
            service.toggleTheme();
            expect(service.getCurrentTheme()).toBe(true);
        });

        it('should handle setTheme with same value', () => {
            service.setTheme(false);
            service.setTheme(false);
            expect(service.getCurrentTheme()).toBe(false);
        });
    });
});
