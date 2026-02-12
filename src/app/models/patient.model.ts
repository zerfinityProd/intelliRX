export interface Patient {
  uniqueId: string; // Primary key: combination of userId, familyId and phone
  userId: string; // Firebase Auth UID - for user-specific data access
  familyId: string; // lastname_firstname
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: Date;
  gender?: string;
  allergies?: string; 
  createdAt: Date;
  updatedAt: Date;
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

export interface Examination {
  testName: string;
  result: string;
}

export interface Medicine {
  name: string;
  dosage: string;
  frequency: string;
}

export interface Visit {
  id?: string;
  presentIllness?: string;
  chiefComplaints: string;
  diagnosis: string;
  examination: string;
  medicines?: string; 
  treatmentPlan: string;
  advice: string;
  createdAt: Date;
  updatedAt: Date;
}