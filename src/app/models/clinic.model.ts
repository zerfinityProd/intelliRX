export interface ClinicTiming {
  label: string;   // e.g. "FH" (first half), "SH" (second half)
  start: string;   // e.g. "09:00"
  end: string;     // e.g. "13:00"
}

export interface ClinicSchedule {
  weekdays: string[];        // e.g. ["M","T","W","Th","F"]
  timings: ClinicTiming[];
}

export interface Clinic {
  id?: string;
  subscription_id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  schedule: ClinicSchedule;
  doctor_ids?: string[];       // user IDs of doctors assigned to this clinic
  permissions?: Record<string, string[]>;  // role → permission overrides (e.g. { "doctor": ["canEdit"] })
  created_at?: string;         // ISO datetime
  updated_at?: string;         // ISO datetime
}
