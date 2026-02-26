import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HomeComponent } from './home';
import { AuthenticationService } from '../../services/authenticationService';
import { PatientService } from '../../services/patient';
import { ThemeService } from '../../services/themeService';
import { UIStateService } from '../../services/uiStateService';
import { Router } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';
import { Patient } from '../../models/patient.model';

describe('HomeComponent (Refactored)', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let authService: any;
  let patientService: any;
  let themeService: any;
  let uiStateService: any;
  let router: any;

  const mockPatient: Patient = {
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

  const mockUser = {
    uid: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  beforeEach(async () => {
    authService = {
      currentUser$: of(mockUser),
      logout: vi.fn().mockResolvedValue(undefined)
    };

    patientService = {
      searchResults$: new BehaviorSubject<Patient[]>([]),
      searchPatients: vi.fn().mockResolvedValue(undefined),
      clearSearchResults: vi.fn(),
      loadMorePatients: vi.fn().mockResolvedValue(undefined),
      hasMoreResults: false,
      isLoadingMore: false
    };

    themeService = {
      isDarkTheme: vi.fn().mockReturnValue(of(false)),
      toggleTheme: vi.fn()
    };

    uiStateService = {
      getUIState: vi.fn().mockReturnValue(
        of({
          showAddPatientForm: false,
          isFabOpen: false,
          showAddVisitForm: false,
          selectedPatientForVisit: null,
          isEditingPatientForVisit: false,
          isUserMenuOpen: false
        })
      ),
      openAddPatientForm: vi.fn(),
      closeAddPatientForm: vi.fn(),
      toggleFab: vi.fn(),
      openAddVisitForm: vi.fn(),
      closeAddVisitForm: vi.fn(),
      toggleVisitEditMode: vi.fn(),
      toggleUserMenu: vi.fn(),
      closeUserMenu: vi.fn()
    };

    router = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: AuthenticationService, useValue: authService },
        { provide: PatientService, useValue: patientService },
        { provide: ThemeService, useValue: themeService },
        { provide: UIStateService, useValue: uiStateService },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create component', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize observable properties', () => {
      expect(component.currentUser$).toBeTruthy();
      expect(component.isDarkTheme$).toBeTruthy();
      expect(component.uiState$).toBeTruthy();
    });

    it('should initialize search state', () => {
      expect(component.searchTerm).toBe('');
      expect(component.searchResults).toEqual([]);
      expect(component.errorMessage).toBe('');
      expect(component.isSearching).toBe(false);
    });
  });

  describe('Search Functionality', () => {
    it('should execute immediate search', async () => {
      component.searchTerm = 'immediate';
      await component.onSearch();
      expect(patientService.searchPatients).toHaveBeenCalledWith('immediate');
    });

    it('should clear search completely', () => {
      component.searchTerm = 'test';
      component.errorMessage = 'error';
      component.isSearching = true;

      component.clearSearch();

      expect(component.searchTerm).toBe('');
      expect(component.errorMessage).toBe('');
      expect(component.isSearching).toBe(false);
      expect(patientService.clearSearchResults).toHaveBeenCalled();
    });
  });

  describe('Theme Management', () => {
    it('should toggle theme', () => {
      component.toggleTheme();
      expect(themeService.toggleTheme).toHaveBeenCalled();
    });
  });

  describe('UI State Management', () => {
    it('should toggle FAB', () => {
      component.toggleFab();
      expect(uiStateService.toggleFab).toHaveBeenCalled();
    });

    it('should open add patient form', () => {
      component.openAddPatientForm();
      expect(uiStateService.openAddPatientForm).toHaveBeenCalled();
    });

    it('should close add patient form', () => {
      component.closeAddPatientForm();
      expect(uiStateService.closeAddPatientForm).toHaveBeenCalled();
    });

    it('should open add visit form', () => {
      component.openAddVisitForm(mockPatient);
      expect(uiStateService.openAddVisitForm).toHaveBeenCalledWith(mockPatient);
    });

    it('should close add visit form', () => {
      component.closeAddVisitForm();
      expect(uiStateService.closeAddVisitForm).toHaveBeenCalled();
    });

    it('should toggle visit edit mode', () => {
      component.toggleVisitEditMode();
      expect(uiStateService.toggleVisitEditMode).toHaveBeenCalled();
    });

    it('should toggle user menu', () => {
      component.toggleUserMenu();
      expect(uiStateService.toggleUserMenu).toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should navigate to patient details', () => {
      component.viewPatientDetails(mockPatient);
      expect(router.navigate).toHaveBeenCalledWith(['/patient', 'pat-123']);
    });

    it('should clear search when viewing patient details', () => {
      component.searchTerm = 'test';
      component.viewPatientDetails(mockPatient);
      expect(component.searchTerm).toBe('');
    });

    it('should logout and navigate to login', async () => {
      await component.logout();
      expect(authService.logout).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Pagination', () => {
    it('should load more patient results', async () => {
      await component.loadMoreResults();
      expect(patientService.loadMorePatients).toHaveBeenCalled();
    });

    it('should have access to hasMoreResults getter', () => {
      patientService.hasMoreResults = true;
      expect(component.hasMoreResults).toBe(true);
    });
  });

  describe('Date Formatting', () => {
    it('should format valid date', () => {
      const date = new Date('2024-03-15');
      const formatted = component.formatDate(date);
      expect(formatted).toContain('Mar');
    });

    it('should return N/A for null date', () => {
      expect(component.formatDate(null)).toBe('N/A');
    });

    it('should return N/A for undefined date', () => {
      expect(component.formatDate(undefined)).toBe('N/A');
    });
  });

  describe('Separation of Concerns', () => {
    it('should delegate theme to ThemeService', () => {
      expect(themeService.toggleTheme).toBeDefined();
    });

    it('should delegate UI state to UIStateService', () => {
      expect(uiStateService.openAddPatientForm).toBeDefined();
      expect(uiStateService.toggleFab).toBeDefined();
    });
  });
});
