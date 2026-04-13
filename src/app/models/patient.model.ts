export interface Patient {
  id?: string;                // Firestore document ID
  subscription_id: string;
  name: string;
  phone: string;
  email?: string;
  dob?: string;               // ISO date string e.g. "1990-01-01"
  gender?: string;
  allergies?: string;          // comma-separated string
  ailments?: string;           // comma-separated string
  clinic_ids: string[];        // array of clinic IDs patient is associated with
  family_id?: string;          // auto-generated family identifier (e.g. "sharma_9876543210")
  created_at?: string;         // ISO datetime — when the patient was first registered
  last_updated?: string;       // ISO datetime string
}

export interface Illness {
  description: string;
}

export interface Allergy {
  name: string;
}

export interface ChiefComplaint {
  description: string;
}

export interface Diagnosis {
  description: string;
}

export interface TestRecord {
  test_name: string;
  status: 'completed' | 'suggested' | 'pending';
  result: string | null;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration_days?: number;
}

export interface ClinicalData {
  chief_complaints: string[];
  diagnosis: string[];
  advice: string;
}

export interface VisitSnapshot {
  patient_name: string;
  doctor_name: string;
  clinic_name: string;
}

export interface VisitAudit {
  created_by: string;
  updated_by: string;
}

export interface Visit {
  id?: string;
  subscription_id: string;
  clinic_id: string;
  appointment_id?: string;
  doctor_id: string;
  patient_id: string;
  visit_datetime?: string;          // ISO datetime

  // ── Backward-compatible flat fields (used by current UI) ──
  presentIllness?: string;
  chiefComplaints?: string;
  diagnosis?: string;
  examination?: string[];
  medicines?: string[];
  treatmentPlan?: string;
  advice?: string;
  visitType?: string;               // e.g. "walk-in", "scheduled"

  // ── Structured fields (for future use) ──
  clinical_data?: ClinicalData;
  tests?: TestRecord[];
  medications?: Medication[];
  snapshot?: VisitSnapshot;
  audit?: VisitAudit;

  status?: 'completed' | 'in-progress';
  version?: number;
  created_at: string;               // ISO datetime
  updated_at?: string;              // ISO datetime — last edit timestamp
}