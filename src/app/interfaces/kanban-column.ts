import { Appointment } from '../models/appointment.model';

export interface KanbanColumn {
    id: Appointment['status'];
    label: string;
    color: string;
    accent: string;
    icon: string;
}
