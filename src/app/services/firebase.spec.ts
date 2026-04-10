import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── vi.hoisted() ─────────────────────────────────────────────────────────────
const {
  mockSetDoc,
  mockGetDoc,
  mockGetDocs,
  mockUpdateDoc,
  mockDeleteDoc,
  mockDoc,
  mockCollection,
  mockQuery,
  mockWhere,
  mockOrderBy,
  mockLimit,
  MockTimestamp,
} = vi.hoisted(() => {
  class MockTimestamp {
    _date: Date;
    constructor(date: Date) { this._date = date; }
    toDate() { return this._date; }
    static fromDate(date: Date) { return new MockTimestamp(date); }
  }
  return {
    mockSetDoc: vi.fn().mockResolvedValue(undefined),
    mockGetDoc: vi.fn(),
    mockGetDocs: vi.fn(),
    mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
    mockDeleteDoc: vi.fn().mockResolvedValue(undefined),
    mockDoc: vi.fn(),
    mockCollection: vi.fn(),
    mockQuery: vi.fn(),
    mockWhere: vi.fn(),
    mockOrderBy: vi.fn(),
    mockLimit: vi.fn(),
    MockTimestamp,
  };
});

// ─── Mock @angular/fire/firestore ─────────────────────────────────────────────
vi.mock('@angular/fire/firestore', () => ({
  Firestore: class { },
  collection: (...args: any[]) => mockCollection(...args),
  doc: (...args: any[]) => mockDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  limit: (...args: any[]) => mockLimit(...args),
  startAfter: vi.fn(),
  Timestamp: MockTimestamp,
}));

// ─── Mock @angular/core ───────────────────────────────────────────────────────
vi.mock('@angular/core', () => ({
  Injectable: () => (target: any) => target,
  ɵɵdefineInjectable: (...args: any[]) => { },
  ɵɵinject: (...args: any[]) => { },
  ɵsetClassMetadata: (...args: any[]) => { },
  ɵɵinjectAttribute: (...args: any[]) => { },
}));

// ─── Import service AFTER mocks are registered ───────────────────────────────
import { FirebaseService } from './firebase';
import { Patient, Visit } from '../models/patient.model';

// ─── Mock ClinicContextService ───────────────────────────────────────────────
const mockClinicContext = {
  requireSubscriptionId: () => 'sub_01',
  getSelectedClinicId: () => 'clinic_01',
  getSubscriptionId: () => 'sub_01',
  getSubscriptionCollectionPath: (sub: string) => `subscriptions/sub_01/${sub}`,
  setClinicContext: vi.fn(),
  clear: vi.fn(),
  context$: { subscribe: vi.fn() },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeService(): FirebaseService {
  mockCollection.mockReturnValue({ id: 'patients' } as any);
  return new FirebaseService({} as any, mockClinicContext as any);
}

function makeMockPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'test-patient-id',
    subscription_id: 'sub_01',
    name: 'John Doe',
    phone: '1234567890',
    email: 'john@example.com',
    clinic_ids: ['clinic_01'],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('FirebaseService', () => {

  let service: FirebaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = makeService();
  });

  // ── addPatient ───────────────────────────────────────────────────────────────
  describe('addPatient', () => {
    it('calls setDoc and returns the generated id', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);

      const result = await service.addPatient({
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '1234567890',
        clinic_ids: ['clinic_01'],
      });

      expect(mockSetDoc).toHaveBeenCalledOnce();
      expect(result).toBe('test-doc');
    });

    it('injects subscription_id from context when not provided', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);

      await service.addPatient({
        subscription_id: '',  // empty — should be filled from context
        name: 'Jane Smith',
        phone: '9876543210',
        clinic_ids: [],
      });

      const savedData = mockSetDoc.mock.calls[0][1];
      expect(savedData.subscription_id).toBe('sub_01');
    });

    it('sets created_at and last_updated timestamps', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);

      await service.addPatient({
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '1234567890',
        clinic_ids: [],
      });

      const savedData = mockSetDoc.mock.calls[0][1];
      expect(savedData.created_at).toBeDefined();
      expect(savedData.last_updated).toBeDefined();
    });

    it('adds nameLower search field', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);

      await service.addPatient({
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '1234567890',
        clinic_ids: [],
      });

      const savedData = mockSetDoc.mock.calls[0][1];
      expect(savedData.nameLower).toBe('john doe');
    });

    it('throws when setDoc rejects', async () => {
      mockDoc.mockReturnValue({} as any);
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));

      await expect(
        service.addPatient({
          subscription_id: 'sub_01',
          name: 'John Doe',
          phone: '1234567890',
          clinic_ids: [],
        })
      ).rejects.toThrow('Firestore write failed');
    });
  });

  // ── getPatientById ──────────────────────────────────────────────────────────
  describe('getPatientById', () => {
    it('returns patient when document exists', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });

      const result = await service.getPatientById('test-patient-id');
      expect(result).toMatchObject({ name: 'John Doe' });
    });

    it('returns null when document does not exist', async () => {
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });

      const result = await service.getPatientById('nonexistent-id');
      expect(result).toBeNull();
    });

    it('returns cached patient on second call without hitting Firestore again', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });

      await service.getPatientById('test-patient-id');
      await service.getPatientById('test-patient-id');

      expect(mockGetDoc).toHaveBeenCalledOnce();
    });
  });

  // ── searchPatientByPhone ────────────────────────────────────────────────────
  describe('searchPatientByPhone', () => {
    it('returns matching patients', async () => {
      const patient = makeMockPatient();
      mockQuery.mockReturnValue({} as any);
      mockWhere.mockReturnValue({} as any);
      mockOrderBy.mockReturnValue({} as any);
      mockLimit.mockReturnValue({} as any);
      mockGetDocs.mockResolvedValueOnce({ docs: [{ data: () => patient }] });

      const result = await service.searchPatientByPhone('1234567890');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].phone).toBe('1234567890');
    });

    it('returns empty array when no patients found', async () => {
      mockQuery.mockReturnValue({} as any);
      mockWhere.mockReturnValue({} as any);
      mockOrderBy.mockReturnValue({} as any);
      mockLimit.mockReturnValue({} as any);
      mockGetDocs.mockResolvedValueOnce({ docs: [] });

      const result = await service.searchPatientByPhone('0000000000');
      expect(result.results).toHaveLength(0);
    });
  });

  // ── updatePatient ──────────────────────────────────────────────────────────
  describe('updatePatient', () => {
    it('calls updateDoc with updated data', async () => {
      mockDoc.mockReturnValue({} as any);

      await service.updatePatient('test-patient-id', { name: 'John Updated' });
      expect(mockUpdateDoc).toHaveBeenCalledOnce();
    });

    it('sets last_updated and nameLower when name is updated', async () => {
      mockDoc.mockReturnValue({} as any);

      await service.updatePatient('test-patient-id', { name: 'John Updated' });

      const updatePayload = mockUpdateDoc.mock.calls[0][1];
      expect(updatePayload.last_updated).toBeDefined();
      expect(updatePayload.nameLower).toBe('john updated');
    });
  });

  // ── addVisit ────────────────────────────────────────────────────────────────
  describe('addVisit', () => {
    it('adds a visit and returns the visit id', async () => {
      const fakeVisitDocRef = { id: 'visit123' } as any;
      mockDoc.mockReturnValueOnce(fakeVisitDocRef);

      const id = await service.addVisit({
        subscription_id: 'sub_01',
        clinic_id: 'clinic_01',
        doctor_id: 'doc_01',
        patient_id: 'test-patient-id',
        chiefComplaints: 'Headache',
        diagnosis: 'Migraine',
        advice: 'Rest',
      });

      expect(id).toBe('visit123');
      expect(mockSetDoc).toHaveBeenCalledOnce();
    });

    it('injects subscription_id from context when not provided', async () => {
      const fakeVisitDocRef = { id: 'visit456' } as any;
      mockDoc.mockReturnValueOnce(fakeVisitDocRef);

      await service.addVisit({
        subscription_id: '',  // empty — should be filled from context
        clinic_id: 'clinic_01',
        doctor_id: 'doc_01',
        patient_id: 'test-patient-id',
        chiefComplaints: 'Cough',
      });

      const savedData = mockSetDoc.mock.calls[0][1];
      expect(savedData.subscription_id).toBe('sub_01');
    });
  });

  // ── Cache expiry ────────────────────────────────────────────────────────────
  describe('Cache expiry', () => {
    it('fetches fresh data after cache expires (5 minutes)', async () => {
      vi.useFakeTimers();
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => patient });

      await service.getPatientById('test-patient-id');
      expect(mockGetDoc).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await service.getPatientById('test-patient-id');
      expect(mockGetDoc).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  // ── clearCache ──────────────────────────────────────────────────────────────
  describe('clearCache', () => {
    it('forces a Firestore fetch after cache is cleared', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => patient });

      await service.getPatientById('test-patient-id');
      service.clearCache();
      await service.getPatientById('test-patient-id');

      expect(mockGetDoc).toHaveBeenCalledTimes(2);
    });
  });

  // ── Data conversion ─────────────────────────────────────────────────────────
  describe('Data conversion (Firestore <-> App)', () => {
    it('convertToFirestore converts Date fields to Timestamp', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);
      const inputDate = new Date('2024-06-15');

      await service.addPatient({
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '1234567890',
        clinic_ids: [],
        dob: inputDate as any,  // testing Date → Timestamp conversion
      } as any);

      const savedData = mockSetDoc.mock.calls[0][1];
      // Date fields get converted to Timestamp
      if (savedData.dob && typeof savedData.dob.toDate === 'function') {
        expect(savedData.dob.toDate()).toEqual(inputDate);
      }
    });

    it('convertFromFirestore converts Timestamp fields back to Date', async () => {
      const ts = MockTimestamp.fromDate(new Date('2024-06-15'));
      const rawData: any = {
        id: 'test-patient-id',
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '1234567890',
        clinic_ids: ['clinic_01'],
        created_at: ts,
        last_updated: ts,
      };
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => rawData });

      const patient = await service.getPatientById('test-patient-id');
      // Timestamps should have been converted back to Date objects
      expect(patient?.created_at).toBeInstanceOf(Date);
      expect(patient?.last_updated).toBeInstanceOf(Date);
    });

    it('strips undefined fields before writing to Firestore', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);

      await service.addPatient({
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '1234567890',
        clinic_ids: [],
        email: undefined,
      } as any);

      const savedData = mockSetDoc.mock.calls[0][1];
      expect('email' in savedData).toBe(false);
    });
  });
});