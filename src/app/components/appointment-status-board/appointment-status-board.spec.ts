import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';

describe('AppointmentStatusBoardComponent Optimization', () => {
  it('should pre-group cards by status and return stable array references', () => {
    const comp = new AppointmentStatusBoardComponent();
    const appts: Appointment[] = [
      { id: '1', datetime: new Date('2026-09-29T10:00:00'), status: 'scheduled' },
      { id: '2', datetime: new Date('2026-09-29T11:00:00'), status: 'cancelled' },
    ];

    comp.filteredAppointments = appts;

    expect(comp.cardsFor('scheduled').length).toBe(1);
    expect(comp.cardsFor('completed').length).toBe(0);
    expect(comp.cardsFor('cancelled').length).toBe(1);

    // Verify referential stability (returns the exact same array instance across calls)
    const cards1 = comp.cardsFor('scheduled');
    const cards2 = comp.cardsFor('scheduled');
    expect(cards1).toBe(cards2);
  });
});
