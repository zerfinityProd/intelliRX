import { describe, it, expect, vi, beforeEach } from 'vitest';

function createPatientDetailsComponent(route: any, router: any, patientService: any, cdr: any, ngZone: any) {
  const component = {
    patient: null as any,
    visits: [] as any[],
    isLoadingPatient: true,
    isLoadingVisits: false,
    activeTab: 'info' as 'info' | 'visits',
    errorMessage: '',
    showAddVisitForm: false,
    isEditingPatient: false,
    showEditPatientInfo: false,

    async ngOnInit() {
      const patientId = route.snapshot.paramMap.get('id');
      
      if (!patientId) {
        ngZone.run(() => {
          this.errorMessage = 'Invalid patient ID';
          this.isLoadingPatient = false;
        });
        return;
      }

      await this.loadPatient(patientId);
    },

    async loadPatient(patientId: string) {
      ngZone.run(() => {
        this.isLoadingPatient = true;
        this.errorMessage = '';
      });
      
      try {
        this.patient = await patientService.getPatient(patientId);
        
        if (!this.patient) {
          ngZone.run(() => {
            this.errorMessage = 'Patient not found';
            this.isLoadingPatient = false;
          });
          return;
        }

        ngZone.run(() => {
          this.isLoadingPatient = false;
        });

        await this.loadVisits(patientId);
      } catch (error) {
        ngZone.run(() => {
          this.errorMessage = 'Error loading patient details';
          this.isLoadingPatient = false;
        });
      }
    },

    async loadVisits(patientId: string) {
      this.isLoadingVisits = true;
      try {
        this.visits = await patientService.getPatientVisits(patientId);
        this.isLoadingVisits = false;
      } catch (error) {
        this.isLoadingVisits = false;
      }
    },

    switchTab(tab: 'info' | 'visits') {
      this.activeTab = tab;
    },

    goBack() {
      router.navigate(['/home']);
    },

    toggleAddVisitForm() {
      this.showAddVisitForm = !this.showAddVisitForm;
    },

    toggleEditPatientInfo() {
      this.showEditPatientInfo = !this.showEditPatientInfo;
    }
  };

  return component;
}

function makeComponent(patientId: string | null = 'patient-123') {
  const mockPatient = {
    uniqueId: 'patient-123',
    userId: 'user1',
    name: 'John Doe',
    phone: '1234567890',
  };

  const mockVisits = [
    { id: 'visit-1', diagnosis: 'Viral fever', createdAt: new Date('2024-03-10') },
  ];

  const patientServiceMock = {
    getPatient: vi.fn().mockResolvedValue(mockPatient),
    getPatientVisits: vi.fn().mockResolvedValue(mockVisits),
  };

  const routeMock = { snapshot: { paramMap: { get: vi.fn().mockReturnValue(patientId) } } };
  const routerMock = { navigate: vi.fn() };
  const cdrMock = { detectChanges: vi.fn() };
  const ngZoneMock = { run: (fn: any) => fn() };

  const comp = createPatientDetailsComponent(routeMock, routerMock, patientServiceMock, cdrMock, ngZoneMock);

  return { comp, patientServiceMock, routerMock, mockPatient, mockVisits };
}

describe('PatientDetailsComponent', () => {
  let comp: any;
  let patientServiceMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ comp, patientServiceMock } = makeComponent());
  });

  describe('ngOnInit — success', () => {
    it('loads patient data', async () => {
      await comp.ngOnInit();
      expect(comp.patient).toBeTruthy();
    });

    it('calls getPatient with correct patientId', async () => {
      await comp.ngOnInit();
      expect(patientServiceMock.getPatient).toHaveBeenCalledWith('patient-123');
    });
  });

  describe('ngOnInit — missing patientId', () => {
    it('sets errorMessage when patientId is null', async () => {
      const { comp: c } = makeComponent(null);
      await c.ngOnInit();
      expect(c.errorMessage).toBe('Invalid patient ID');
    });
  });

  describe('switchTab', () => {
    it('switches to visits tab', () => {
      comp.switchTab('visits');
      expect(comp.activeTab).toBe('visits');
    });
  });
});