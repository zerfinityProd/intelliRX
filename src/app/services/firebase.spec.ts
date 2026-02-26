import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── vi.hoisted() ─────────────────────────────────────────────────────────────
// vi.mock() is hoisted to the TOP of the file by Vitest at compile time.
// Any variables used inside vi.mock() must ALSO be hoisted — otherwise they
// are "not yet initialized" when the mock factory runs.
// vi.hoisted() guarantees these values exist before any mock is executed.
const {
  mockSetDoc,
  mockGetDoc,
  mockGetDocs,
  mockUpdateDoc,
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
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  limit: (...args: any[]) => mockLimit(...args),
  Timestamp: MockTimestamp,
}));

// ─── Mock @angular/core (Injectable decorator) ────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeService(): FirebaseService {
  mockCollection.mockReturnValue({ id: 'patients' } as any);
  return new FirebaseService({} as any);
}

function makeMockPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    uniqueId: 'doe_john_1234567890_user1',
    userId: 'user1',
    familyId: 'doe_john_1234567890',
    name: 'John Doe',
    phone: '1234567890',
    email: 'john@example.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
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

  // ── generateFamilyId ────────────────────────────────────────────────────────
  describe('generateFamilyId', () => {
    it('returns lastname_firstname_phone for a two-part name', () => {
      expect(service.generateFamilyId('John Doe', '1234567890')).toBe('doe_john_1234567890');
      expect(service.generateFamilyId('Jane Smith', '9876543210')).toBe('smith_jane_9876543210');
    });

    it('uses the last word as last name for three-part names', () => {
      expect(service.generateFamilyId('Mary Jane Watson', '1234567890')).toBe('watson_mary_1234567890');
    });

    it('returns single name lowercased with phone when no space is present', () => {
      expect(service.generateFamilyId('Robert', '1234567890')).toBe('robert_1234567890');
    });

    it('trims leading/trailing spaces before processing', () => {
      expect(service.generateFamilyId('  John Doe  ', '1234567890')).toBe('doe_john_1234567890');
    });

    it('lowercases all parts', () => {
      expect(service.generateFamilyId('JOHN DOE', '1234567890')).toBe('doe_john_1234567890');
    });
  });

  // ── Phone number validation ──────────────────────────────────────────────────
  describe('Phone number validation', () => {
    const isValidPhone = (p: string) => /^\d{10}$/.test(p);

    it('accepts a valid 10-digit number', () => {
      expect(isValidPhone('1234567890')).toBe(true);
    });

    it('rejects numbers shorter than 10 digits', () => {
      expect(isValidPhone('12345')).toBe(false);
    });

    it('rejects numbers longer than 10 digits', () => {
      expect(isValidPhone('12345678901')).toBe(false);
    });

    it('rejects numbers containing non-digit characters', () => {
      expect(isValidPhone('123-456-789')).toBe(false);
      expect(isValidPhone('123 456 789')).toBe(false);
    });
  });

  // ── addPatient ───────────────────────────────────────────────────────────────
  describe('addPatient', () => {
    it('calls setDoc and returns the generated uniqueId', async () => {
      mockDoc.mockReturnValue({ id: 'test-doc' } as any);

      const result = await service.addPatient({
        userId: 'user1', familyId: 'doe_john_1234567890', name: 'John Doe', phone: '1234567890',
      } as any, 'user1');

      expect(mockSetDoc).toHaveBeenCalledOnce();
      expect(result).toBe('doe_john_1234567890_user1');
    });

    it('throws when setDoc rejects', async () => {
      mockDoc.mockReturnValue({} as any);
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));

      await expect(
        service.addPatient({
          userId: 'user1', familyId: 'doe_john_1234567890', name: 'John Doe', phone: '1234567890',
        } as any, 'user1')
      ).rejects.toThrow('Firestore write failed');
    });
  });

  // ── getPatientById ───────────────────────────────────────────────────────────
  describe('getPatientById', () => {
    it('returns patient when document exists and userId matches', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });

      const result = await service.getPatientById('doe_john_1234567890_user1', 'user1');
      expect(result).toMatchObject({ uniqueId: 'doe_john_1234567890_user1', userId: 'user1' });
    });

    it('returns null when document does not exist', async () => {
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });

      expect(await service.getPatientById('nonexistent', 'user1')).toBeNull();
    });

    it('returns null when userId does not match (security check)', async () => {
      const patient = makeMockPatient({ userId: 'other_user' });
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });

      expect(await service.getPatientById('doe_john_1234567890_user1', 'user1')).toBeNull();
    });

    it('returns cached patient on second call without hitting Firestore again', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });

      await service.getPatientById(patient.uniqueId, 'user1');
      await service.getPatientById(patient.uniqueId, 'user1');

      expect(mockGetDoc).toHaveBeenCalledOnce(); // only 1 Firestore call
    });
  });

  // ── searchPatientByPhone ─────────────────────────────────────────────────────
  describe('searchPatientByPhone', () => {
    it('returns matching patients', async () => {
      const patient = makeMockPatient();
      mockQuery.mockReturnValue({} as any);
      mockWhere.mockReturnValue({} as any);
      mockOrderBy.mockReturnValue({} as any);
      mockGetDocs.mockResolvedValueOnce({ docs: [{ data: () => patient }] });

      const result = await service.searchPatientByPhone('1234567890', 'user1');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].phone).toBe('1234567890');
    });

    it('returns empty array when no patients found', async () => {
      mockQuery.mockReturnValue({} as any);
      mockWhere.mockReturnValue({} as any);
      mockOrderBy.mockReturnValue({} as any);
      mockGetDocs.mockResolvedValueOnce({ docs: [] });

      const result = await service.searchPatientByPhone('0000000000', 'user1');
      expect(result.results).toHaveLength(0);
    });
  });

  // ── searchPatientByFamilyId ──────────────────────────────────────────────────
  describe('searchPatientByFamilyId', () => {
    it('returns patients matching the family ID prefix', async () => {
      const patient = makeMockPatient();
      mockQuery.mockReturnValue({} as any);
      mockWhere.mockReturnValue({} as any);
      mockOrderBy.mockReturnValue({} as any);
      mockGetDocs.mockResolvedValueOnce({ docs: [{ data: () => patient }] });

      const result = await service.searchPatientByFamilyId('doe_john_1234567890', 'user1');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].familyId).toBe('doe_john_1234567890');
    });
  });

  // ── updatePatient ────────────────────────────────────────────────────────────
  describe('updatePatient', () => {
    it('calls updateDoc after verifying ownership', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });

      await service.updatePatient(patient.uniqueId, { name: 'John Updated' }, 'user1');
      expect(mockUpdateDoc).toHaveBeenCalledOnce();
    });

    it('throws when patient not found or userId mismatch', async () => {
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });

      await expect(
        service.updatePatient('bad_id', { name: 'X' }, 'user1')
      ).rejects.toThrow('Patient not found or unauthorized');
    });
  });

  // ── addVisit ─────────────────────────────────────────────────────────────────
  describe('addVisit', () => {
    it('adds a visit and returns the visit id', async () => {
      const patient = makeMockPatient();
      const fakeVisitDocRef = { id: 'visit123' } as any;

      mockDoc
        .mockReturnValueOnce({} as any)        // patient doc ref (getPatientById)
        .mockReturnValueOnce({} as any)        // patientDoc ref
        .mockReturnValueOnce(fakeVisitDocRef); // visitDoc ref

      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => patient });
      mockCollection.mockReturnValue({} as any);

      const id = await service.addVisit(patient.uniqueId, {
        chiefComplaints: 'Headache', diagnosis: 'Migraine',
        examination: 'Normal BP', treatmentPlan: 'Rest', advice: 'Drink water',
      }, 'user1');

      expect(id).toBe('visit123');
      expect(mockSetDoc).toHaveBeenCalledOnce();
    });

    it('throws when patient not found', async () => {
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });

      await expect(
        service.addVisit('bad_id', {
          chiefComplaints: 'x', diagnosis: 'x', examination: 'x',
          treatmentPlan: 'x', advice: 'x',
        }, 'user1')
      ).rejects.toThrow('Patient not found or unauthorized');
    });
  });

  // ── Cache expiry ─────────────────────────────────────────────────────────────
  describe('Cache expiry', () => {
    it('fetches fresh data after cache expires (5 minutes)', async () => {
      vi.useFakeTimers();
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => patient });

      await service.getPatientById(patient.uniqueId, 'user1');
      expect(mockGetDoc).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1); // past 5-min cache window

      await service.getPatientById(patient.uniqueId, 'user1');
      expect(mockGetDoc).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  // ── clearCache ───────────────────────────────────────────────────────────────
  describe('clearCache', () => {
    it('forces a Firestore fetch after cache is cleared', async () => {
      const patient = makeMockPatient();
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => patient });

      await service.getPatientById(patient.uniqueId, 'user1');
      service.clearCache();
      await service.getPatientById(patient.uniqueId, 'user1');

      expect(mockGetDoc).toHaveBeenCalledTimes(2);
    });
  });

  // ── Firestore data conversion ─────────────────────────────────────────────────
  describe('Data conversion (Firestore <-> App)', () => {
    it('convertToFirestore converts Date fields to Timestamp', async () => {
      mockDoc.mockReturnValue({} as any);
      const inputDate = new Date('2024-06-15');

      await service.addPatient({
        userId: 'user1', familyId: 'doe_john_1234567890', name: 'John Doe',
        phone: '1234567890', dateOfBirth: inputDate,
      } as any, 'user1');

      const savedData = mockSetDoc.mock.calls[0][1];
      expect(typeof savedData.dateOfBirth?.toDate).toBe('function');
      expect(savedData.dateOfBirth.toDate()).toEqual(inputDate);
    });

    it('convertFromFirestore converts Timestamp fields back to Date', async () => {
      const ts = MockTimestamp.fromDate(new Date('2024-06-15'));
      const rawData: any = {
        uniqueId: 'doe_john_1234567890_user1', userId: 'user1',
        familyId: 'doe_john_1234567890', name: 'John Doe', phone: '1234567890',
        createdAt: ts, updatedAt: ts,
      };
      mockDoc.mockReturnValue({} as any);
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => rawData });

      const patient = await service.getPatientById('doe_john_1234567890_user1', 'user1');
      expect(patient?.createdAt).toBeInstanceOf(Date);
      expect(patient?.updatedAt).toBeInstanceOf(Date);
    });

    it('strips undefined fields before writing to Firestore', async () => {
      mockDoc.mockReturnValue({} as any);

      await service.addPatient({
        userId: 'user1', familyId: 'doe_john_1234567890', name: 'John Doe',
        phone: '1234567890', email: undefined,
      } as any, 'user1');

      const savedData = mockSetDoc.mock.calls[0][1];
      expect('email' in savedData).toBe(false);
    });
  });
});