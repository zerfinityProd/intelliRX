import { describe, it, expect, vi, beforeEach } from 'vitest';

function createPatientStatsComponent() {
  const component = {
    patient: null as any,
    visits: [] as any[],
    visitsByDateMap: new Map<string, any[]>(),
    
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
        this.buildVisitsByDateMap();
        this.calculateStats();
      }
    },

    buildVisitsByDateMap() {
      this.visitsByDateMap.clear();
      if (!this.visits || this.visits.length === 0) return;

      for (const visit of this.visits) {
        const rawDate = visit.created_at || visit.createdAt;
        if (!rawDate) continue;
        const visitDate = typeof rawDate.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
        if (isNaN(visitDate.getTime())) continue;

        const key = `${visitDate.getFullYear()}-${visitDate.getMonth()}-${visitDate.getDate()}`;
        const list = this.visitsByDateMap.get(key);
        if (list) {
          list.push(visit);
        } else {
          this.visitsByDateMap.set(key, [visit]);
        }
      }
    },

    getVisitsForDate(date: Date) {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return this.visitsByDateMap.get(key) || [];
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

  describe('visitsByDateMap & getVisitsForDate optimization', () => {
    it('indexes visits by date key correctly', () => {
      comp.patient = makePatient();
      const v1 = { id: 'v1', created_at: new Date('2025-05-10T10:00:00') };
      const v2 = { id: 'v2', created_at: new Date('2025-05-10T14:00:00') };
      const v3 = { id: 'v3', created_at: new Date('2025-05-11T09:00:00') };
      comp.visits = [v1, v2, v3];

      comp.ngOnChanges({ patient: {}, visits: {} });

      const day1 = new Date('2025-05-10T00:00:00');
      const day2 = new Date('2025-05-11T00:00:00');
      const day3 = new Date('2025-05-12T00:00:00');

      expect(comp.getVisitsForDate(day1)).toEqual([v1, v2]);
      expect(comp.getVisitsForDate(day2)).toEqual([v3]);
      expect(comp.getVisitsForDate(day3)).toEqual([]);
    });
  });
});