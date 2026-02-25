import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UIStateService } from './uiStateService';
import { Patient } from '../models/patient.model';

describe('UIStateService', () => {
    let service: UIStateService;
    let mockPatient: Patient;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(UIStateService);

        mockPatient = {
            uniqueId: 'pat-123',
            userId: 'user-456',
            name: 'John Doe',
            familyId: 'fam-001',
            phone: '555-1234',
            email: 'john@example.com',
            gender: 'Male',
            createdAt: new Date(),
            updatedAt: new Date()
        };
    });

    describe('Initial State', () => {
        it('should initialize with all UI flags as false/null', () => {
            const state = service.getCurrentUIState();
            expect(state.showAddPatientForm).toBe(false);
            expect(state.isFabOpen).toBe(false);
            expect(state.showAddVisitForm).toBe(false);
            expect(state.isEditingPatientForVisit).toBe(false);
            expect(state.isUserMenuOpen).toBe(false);
            expect(state.selectedPatientForVisit).toBeNull();
        });
    });

    describe('Add Patient Form', () => {
        it('should open add patient form and close FAB', () => {
            service.openAddPatientForm();
            const state = service.getCurrentUIState();
            expect(state.showAddPatientForm).toBe(true);
            expect(state.isFabOpen).toBe(false);
        });

        it('should close add patient form', () => {
            service.openAddPatientForm();
            service.closeAddPatientForm();
            const state = service.getCurrentUIState();
            expect(state.showAddPatientForm).toBe(false);
        });
    });

    describe('Floating Action Button', () => {
        it('should toggle FAB open/closed', () => {
            service.toggleFab();
            expect(service.getCurrentUIState().isFabOpen).toBe(true);
        });

        it('should toggle FAB multiple times', () => {
            service.toggleFab();
            service.toggleFab();
            expect(service.getCurrentUIState().isFabOpen).toBe(false);
        });

        it('should close FAB', () => {
            service.toggleFab();
            service.closeFab();
            expect(service.getCurrentUIState().isFabOpen).toBe(false);
        });
    });

    describe('Add Visit Form', () => {
        it('should open add visit form with patient', () => {
            service.openAddVisitForm(mockPatient);
            const state = service.getCurrentUIState();
            expect(state.showAddVisitForm).toBe(true);
            expect(state.selectedPatientForVisit).toEqual(mockPatient);
            expect(state.isEditingPatientForVisit).toBe(false);
            expect(state.isFabOpen).toBe(false);
        });

        it('should close add visit form', () => {
            service.openAddVisitForm(mockPatient);
            service.closeAddVisitForm();
            const state = service.getCurrentUIState();
            expect(state.showAddVisitForm).toBe(false);
            expect(state.selectedPatientForVisit).toBeNull();
            expect(state.isEditingPatientForVisit).toBe(false);
        });

        it('should toggle visit edit mode', () => {
            service.openAddVisitForm(mockPatient);
            service.toggleVisitEditMode();
            expect(service.getCurrentUIState().isEditingPatientForVisit).toBe(true);
        });
    });

    describe('User Menu', () => {
        it('should toggle user menu open/closed', () => {
            service.toggleUserMenu();
            expect(service.getCurrentUIState().isUserMenuOpen).toBe(true);
        });

        it('should close user menu', () => {
            service.toggleUserMenu();
            service.closeUserMenu();
            expect(service.getCurrentUIState().isUserMenuOpen).toBe(false);
        });
    });

    describe('State Reset', () => {
        it('should reset all UI state to initial values', () => {
            service.openAddPatientForm();
            service.toggleFab();
            service.openAddVisitForm(mockPatient);
            service.toggleUserMenu();

            service.resetUIState();

            const state = service.getCurrentUIState();
            expect(state.showAddPatientForm).toBe(false);
            expect(state.isFabOpen).toBe(false);
            expect(state.showAddVisitForm).toBe(false);
            expect(state.selectedPatientForVisit).toBeNull();
            expect(state.isEditingPatientForVisit).toBe(false);
            expect(state.isUserMenuOpen).toBe(false);
        });
    });
});
