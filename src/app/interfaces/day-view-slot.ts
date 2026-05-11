import { Appointment } from '../models/appointment.model';

/**
 * Represents a single time slot in the day-view modal timeline.
 */
export interface DayViewSlot {
  time: string;       // "09:00", "09:30", etc.
  label: string;      // "9:00 AM"
  isHourStart: boolean;
  isBooked: boolean;
  isPast: boolean;
  appointment: Appointment | null;
}
