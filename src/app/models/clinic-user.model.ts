export interface ClinicUserAvailability {
  [day: string]: string[];  // e.g. { "mon": ["FH"], "tue": ["SH"] }
}

export interface ClinicUser {
  id?: string;
  subscription_id: string;
  clinic_id: string;
  user_id: string;
  roles: string[];                        // e.g. ["doctor"]
  permissions?: string[];                 // per-clinic permission overrides (e.g. ["canEdit","canAddPatient"])
  availability?: ClinicUserAvailability;
  display_name?: string;                  // cached user display name for quick lookups
  status: 'active' | 'inactive';
  created_at?: string;                    // ISO datetime
  updated_at?: string;                    // ISO datetime
}
