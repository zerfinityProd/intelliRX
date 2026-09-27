import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AddAppointmentComponent } from './add-appointment';

describe('AddAppointmentComponent - getSlotStatusText', () => {
  let component: AddAppointmentComponent;

  beforeEach(() => {
    component = Object.create(AddAppointmentComponent.prototype);
    component.leaveBlockedSlots = [];
    component.samePatientBookedSlots = [];
    component.bookedSlots = [];
    component.appointmentDate = '2099-01-01';
  });

  it('should return "Blocked - Doctor on leave" when slot is leave-blocked', () => {
    component.leaveBlockedSlots = ['09:00'];
    expect(component.getSlotStatusText('09:00')).toBe('Blocked - Doctor on leave');
  });

  it('should return "Booked by this patient" when slot is booked by the same patient', () => {
    component.samePatientBookedSlots = ['10:00'];
    expect(component.getSlotStatusText('10:00')).toBe('Booked by this patient');
  });

  it('should return "Booked" when slot is in bookedSlots', () => {
    component.bookedSlots = ['11:00'];
    expect(component.getSlotStatusText('11:00')).toBe('Booked');
  });

  it('should return "Past time slot" when slot is in the past for today', () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    component.appointmentDate = `${y}-${m}-${d}`;
    component.isSlotInPast = () => true;
    expect(component.getSlotStatusText('08:00')).toBe('Past time slot');
  });

  it('should return "Available" for an unbooked future slot', () => {
    component.appointmentDate = '2099-01-01'; // guaranteed future date
    component.bookedSlots = [];
    component.samePatientBookedSlots = [];
    component.leaveBlockedSlots = [];
    expect(component.getSlotStatusText('14:00')).toBe('Available');
  });
});
