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

