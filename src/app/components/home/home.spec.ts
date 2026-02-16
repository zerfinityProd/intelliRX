import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSubject } from 'rxjs';

class TestHomeComponent {
  currentUser: any = null;
  searchTerm = '';
  searchResults: any[] = [];
  showAddPatientForm = false;

  constructor(
    private authService: any,
    private patientService: any,
    private router: any,
    private cdr: any,
    private ngZone: any
  ) {
    this.authService.currentUser$.subscribe((user: any) => {
      this.ngZone.run(() => {
        this.currentUser = user;
      });
    });
    this.patientService.searchResults$.subscribe((results: any[]) => {
      this.ngZone.run(() => {
        this.searchResults = results;
      });
    });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  toggleAddPatientForm(): void {
    this.showAddPatientForm = !this.showAddPatientForm;
  }

  viewPatientDetails(patient: any): void {
    this.router.navigate(['/patient', patient.uniqueId]);
  }
}

function makeComponent() {
  const searchResults$ = new BehaviorSubject<any[]>([]);
  const currentUser$ = new BehaviorSubject<any>({ uid: 'user1' });
  const patientServiceMock = {
    searchResults$,
    clearSearchResults: vi.fn(),
  };
  const authServiceMock = {
    currentUser$,
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const routerMock = { navigate: vi.fn() };
  const cdrMock = { detectChanges: vi.fn() };
  const ngZoneMock = { run: (fn: any) => fn() };
  
  const comp = new TestHomeComponent(
    authServiceMock,
    patientServiceMock,
    routerMock,
    cdrMock,
    ngZoneMock
  );
  
  return { comp, patientServiceMock, authServiceMock, routerMock };
}

describe('HomeComponent', () => {
  describe('logout', () => {
    it('calls logout and navigates', async () => {
      const { comp, authServiceMock, routerMock } = makeComponent();
      await comp.logout();
      expect(authServiceMock.logout).toHaveBeenCalled();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('toggleAddPatientForm', () => {
    it('toggles the form visibility', () => {
      const { comp } = makeComponent();
      expect(comp.showAddPatientForm).toBe(false);
      comp.toggleAddPatientForm();
      expect(comp.showAddPatientForm).toBe(true);
    });
  });
});