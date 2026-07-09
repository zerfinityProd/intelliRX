export interface Leave {
  id?: string;             // Sequential ID — format: lv_1, lv_2, ...
  user_id: string;         // Normalized email of the doctor/staff
  clinic_id: string;       // ID of the clinic (e.g. cln_1)
  date: string;            // ISO date string (YYYY-MM-DD)
  timing: 'All Day' | 'FH' | 'SH'; // Leave type
  status: 'approved' | 'pending' | 'rejected';
  created_at?: string;     // ISO datetime string
}
