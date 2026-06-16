export interface Leave {
  id?: string;
  subscription_id?: string; // Optional — path is already scoped to clinic
  user_id: string;          // ID of the doctor/receptionist
  clinic_id: string;        // ID of the clinic
  date: string;            // ISO date string (YYYY-MM-DD)
  timing: 'All Day' | 'FH' | 'SH'; // Type of leave
  status: 'approved' | 'pending' | 'rejected';
  created_at?: string;
}
