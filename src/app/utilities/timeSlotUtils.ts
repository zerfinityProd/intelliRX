import { TimeSlotsConfig } from '../config/systemSettings';

/**
 * Generates slot start times like `09:00`, `09:30`, ... based on configuration.
 * Assumes fixed-length slots (slotMinutes) starting at whole hours.
 */
export function generateTimeSlotsFromConfig(config: TimeSlotsConfig): string[] {
  const slots: string[] = [];
  const start = config.startHour * 60;
  const end = config.endHour * 60; // exclusive

  for (let totalMinutes = start; totalMinutes < end; totalMinutes += config.slotMinutes) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }

  return slots;
}

