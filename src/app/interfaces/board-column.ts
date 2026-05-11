import { Appointment } from '../models/appointment.model';

/**
 * Defines a single column in the appointment status board.
 */
export interface BoardColumn {
    id: Appointment['status'];
    label: string;
    color: string;
    accent: string;
    icon: string;
}
