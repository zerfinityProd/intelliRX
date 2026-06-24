export interface TimeSlotsConfig {
  /**
   * Slot generation uses the start/end hour window and a fixed slot duration.
   * Example (current app behavior):
   * - startHour: 9
   * - endHour: 18 (exclusive)
   * - slotMinutes: 30
   * Produces: 09:00 ... 17:30
   */
  startHour: number;
  endHour: number; // exclusive
  slotMinutes: number;
}

export interface AutoCancelConfig {
  hour: number;
  minute: number;
}

export interface UiDateFilterConfig {
  appointmentsDateMin: string; // YYYY-MM-DD
  appointmentsDateMax: string; // YYYY-MM-DD
}

export interface PatientConfig {
  phoneMaxDigits: number;
}

export interface AddAppointmentConfig {
  maxDate: string; // YYYY-MM-DD
}

/**
 * Subscription-level multi-clinic behaviour controls.
 * These are owned by the admin and scoped to one subscription.
 */
export interface MultiClinicConfig {
  /**
   * When true, patients registered in any clinic under this subscription
   * are visible across all clinics in the same subscription.
   * When false (default), each clinic only sees its own patients.
   */
  share_patients_across_clinics: boolean;

  /**
   * When true, a doctor's availability slots can overlap across different
   * clinics (time-clash is allowed). The admin can still enable/disable
   * individual clinics based on this logic.
   * When false (default), overlapping availability is blocked/warned.
   */
  allow_doctor_time_clash: boolean;
}

export interface SystemSettings {
  timeSlots: TimeSlotsConfig;
  autoCancelAt: AutoCancelConfig;
  ui: UiDateFilterConfig;
  patient: PatientConfig;
  addAppointment: AddAppointmentConfig;
}

// Defaults match existing hardcoded behavior.
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  timeSlots: {
    startHour: 9,
    endHour: 18,
    slotMinutes: 30
  },
  autoCancelAt: {
    hour: 23,
    minute: 0
  },
  ui: {
    appointmentsDateMin: '2000-01-01',
    appointmentsDateMax: '2099-12-31'
  },
  patient: {
    phoneMaxDigits: 10
  },
  addAppointment: {
    maxDate: '9999-12-31'
  }
};

// ─── Sub-configuration overlays ─────────────────────────────────────────────
// Each level can override a subset of SystemSettings fields.
// Merge hierarchy (most-specific wins):
//   System Defaults → Subscription Config → Clinic Config → Doctor Config

/** Subscription-level config overlay (all fields optional) */
export interface SubscriptionConfig {
  timeSlots?: Partial<TimeSlotsConfig>;
  autoCancelAt?: Partial<AutoCancelConfig>;
  ui?: Partial<UiDateFilterConfig>;
  patient?: Partial<PatientConfig>;
  addAppointment?: Partial<AddAppointmentConfig>;
  /** Multi-clinic behavioural flags (subscription-scoped) */
  multiClinic?: Partial<MultiClinicConfig>;
}

/** Default multi-clinic settings (conservative / opt-in) */
export const DEFAULT_MULTI_CLINIC_CONFIG: MultiClinicConfig = {
  share_patients_across_clinics: false,
  allow_doctor_time_clash: false,
};

/** Clinic-level config overlay (all fields optional) */
export interface ClinicConfig {
  timeSlots?: Partial<TimeSlotsConfig>;
  autoCancelAt?: Partial<AutoCancelConfig>;
  ui?: Partial<UiDateFilterConfig>;
  patient?: Partial<PatientConfig>;
  addAppointment?: Partial<AddAppointmentConfig>;
}

export interface PreferencesConfig {
  theme?: 'light' | 'dark';
}

/** Doctor-level config overlay (all fields optional) */
export interface DoctorConfig {
  timeSlots?: Partial<TimeSlotsConfig>;
  autoCancelAt?: Partial<AutoCancelConfig>;
  patient?: Partial<PatientConfig>;
  addAppointment?: Partial<AddAppointmentConfig>;
  preferences?: Partial<PreferencesConfig>;
}

// ─── Deep merge helper ──────────────────────────────────────────────────────

/** Shallow-merge a single section: overlay values replace base values. */
function mergeSection<T extends Record<string, any>>(
  base: T,
  overlay?: Partial<T> | null
): T {
  if (!overlay) return base;
  return { ...base, ...overlay };
}

/**
 * Resolve the effective SystemSettings by deep-merging the global defaults
 * with optional subscription, clinic, and doctor overrides.
 *
 * Fields that are not present in an overlay retain their value from the
 * previous layer (or the global default).
 *
 * @param subscriptionConfig  Subscription-level overrides (applied first)
 * @param clinicConfig        Clinic-level overrides (applied second)
 * @param doctorConfig        Doctor-level overrides (applied last, wins)
 * @returns                   Fully resolved SystemSettings
 */
export function resolveEffectiveSettings(
  subscriptionConfig?: SubscriptionConfig | null,
  clinicConfig?: ClinicConfig | null,
  doctorConfig?: DoctorConfig | null
): SystemSettings {
  // Layer 1 — start from system defaults
  let settings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS };

  // Layer 2 — subscription overrides
  if (subscriptionConfig) {
    settings = {
      timeSlots: mergeSection(settings.timeSlots, subscriptionConfig.timeSlots),
      autoCancelAt: mergeSection(settings.autoCancelAt, subscriptionConfig.autoCancelAt),
      ui: mergeSection(settings.ui, subscriptionConfig.ui),
      patient: mergeSection(settings.patient, subscriptionConfig.patient),
      addAppointment: mergeSection(settings.addAppointment, subscriptionConfig.addAppointment),
    };
  }

  // Layer 3 — clinic overrides
  if (clinicConfig) {
    settings = {
      timeSlots: mergeSection(settings.timeSlots, clinicConfig.timeSlots),
      autoCancelAt: mergeSection(settings.autoCancelAt, clinicConfig.autoCancelAt),
      ui: mergeSection(settings.ui, clinicConfig.ui),
      patient: mergeSection(settings.patient, clinicConfig.patient),
      addAppointment: mergeSection(settings.addAppointment, clinicConfig.addAppointment),
    };
  }

  // Layer 4 — doctor overrides (most specific, wins)
  if (doctorConfig) {
    settings = {
      timeSlots: mergeSection(settings.timeSlots, doctorConfig.timeSlots),
      autoCancelAt: mergeSection(settings.autoCancelAt, doctorConfig.autoCancelAt),
      ui: settings.ui, // DoctorConfig does not override UI date filters
      patient: mergeSection(settings.patient, doctorConfig.patient),
      addAppointment: mergeSection(settings.addAppointment, doctorConfig.addAppointment),
    };
  }

  return settings;
}

