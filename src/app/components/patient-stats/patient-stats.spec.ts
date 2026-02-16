import { describe, it, expect, vi, beforeEach } from 'vitest';

function createPatientStatsComponent() {
  const component = {
    patient: null as any,
    visits: [] as any[],
    
    stats: {
      totalVisits: 0,
      lastVisitDate: 'N/A',
      allergiesCount: 0,
      averageVisitsPerMonth: 0,
    },
    
    showVisitModal: false,
    selectedDateVisits: [] as any[],

    ngOnChanges(changes: any) {
      if ((changes.patient || changes.visits) && this.patient) {
        this.calculateStats();
      }
    },

    calculateStats() {
      this.stats.totalVisits = this.visits.length;
      
      if (this.visits.length > 0) {
        const sortedVisits = [...this.visits].sort((a, b) => {
          const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
          const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });
        const lastVisit = sortedVisits[0];
        const date = lastVisit.createdAt instanceof Date ? lastVisit.createdAt : new Date(lastVisit.createdAt);
        this.stats.lastVisitDate = date.toLocaleDateString();
      } else {
        this.stats.lastVisitDate = 'N/A';
      }
      
      if (this.patient.allergies && Array.isArray(this.patient.allergies)) {
        this.stats.allergiesCount = this.patient.allergies.length;
      } else {
        this.stats.allergiesCount = 0;
      }
    },

    openVisitModal(visits: any[]) {
      this.selectedDateVisits = visits;
      this.showVisitModal = true;
    },

    closeVisitModal() {
      this.showVisitModal = false;
      this.selectedDateVisits = [];
    }
  };

  return component;
}

function makePatient(overrides: any = {}) {
  return {
    uniqueId: 'doe_john_1234567890_user1',
    name: 'John Doe',
    allergies: [],
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeVisit(dateStr: string): any {
  return {
    id: `visit-${dateStr}`,
    diagnosis: 'Migraine',
    createdAt: new Date(dateStr),
  };
}

describe('PatientStatsComponent', () => {
  let comp: any;

  beforeEach(() => {
    vi.clearAllMocks();
    comp = createPatientStatsComponent();
  });

  describe('Initial state', () => {
    it('starts with zero totalVisits', () => {
      expect(comp.stats.totalVisits).toBe(0);
    });

    it('starts with lastVisitDate = "N/A"', () => {
      expect(comp.stats.lastVisitDate).toBe('N/A');
    });
  });

  describe('ngOnChanges with patient and visits', () => {
    it('calculates totalVisits correctly', () => {
      comp.patient = makePatient();
      comp.visits = [makeVisit('2024-01-01'), makeVisit('2024-02-01')];
      comp.ngOnChanges({ patient: {}, visits: {} });

      expect(comp.stats.totalVisits).toBe(2);
    });

    it('counts allergies from patient data', () => {
      comp.patient = makePatient({ allergies: ['Peanuts', 'Dairy'] });
      comp.visits = [];
      comp.ngOnChanges({ patient: {} });

      expect(comp.stats.allergiesCount).toBe(2);
    });
  });

  describe('closeVisitModal', () => {
    it('hides the modal', () => {
      comp.showVisitModal = true;
      comp.closeVisitModal();
      expect(comp.showVisitModal).toBe(false);
    });
  });
});