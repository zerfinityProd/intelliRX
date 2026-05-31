export interface ClinicUserAvailability {
  [day: string]: string[];  // e.g. { "M": ["FH"], "T": ["SH"], "W": ["FH", "SH"] }
}

export interface ClinicUser {
  id?: string;
  clinic_id: string;
  user_id: string;
  availability?: ClinicUserAvailability;
  status: 'active' | 'inactive';
  created_at?: string;                    // ISO datetime
  updated_at?: string;                    // ISO datetime
}
