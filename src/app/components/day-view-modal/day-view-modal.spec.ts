import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DayViewModalComponent } from './day-view-modal';
import { Appointment } from '../../models/appointment.model';

describe('DayViewModalComponent Accessibility', () => {
  let component: DayViewModalComponent;
  let fixture: ComponentFixture<DayViewModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DayViewModalComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DayViewModalComponent);
    component = fixture.componentInstance;
    component.date = new Date('2026-10-15T00:00:00');
    component.allTimeSlots = ['09:00', '09:30'];
    component.appointments = [
      {
        id: 'appt1',
        patientName: 'Jane Doe',
        patient_id: 'p123',
        status: 'scheduled',
        datetime: new Date('2026-10-15T09:00:00').toISOString()
      } as unknown as Appointment
    ];
    fixture.detectChanges();
  });

  it('should render dialog role and aria-modal on modal container', () => {
    const modalEl = fixture.nativeElement.querySelector('.dv-modal');
    expect(modalEl).not.toBeNull();
    expect(modalEl.getAttribute('role')).toBe('dialog');
    expect(modalEl.getAttribute('aria-modal')).toBe('true');
    expect(modalEl.getAttribute('aria-label')).toContain('Schedule for');
  });

  it('should render descriptive aria-labels for appointment action buttons', () => {
    const visitBtn = fixture.nativeElement.querySelector('.dv-action-btn--visit');
    const rescheduleBtn = fixture.nativeElement.querySelector('.dv-action-btn--reschedule');
    const cancelBtn = fixture.nativeElement.querySelector('.dv-action-btn--cancel');

    expect(visitBtn).not.toBeNull();
    expect(visitBtn.getAttribute('aria-label')).toBe('Add visit for Jane Doe');

    expect(rescheduleBtn).not.toBeNull();
    expect(rescheduleBtn.getAttribute('aria-label')).toBe('Reschedule appointment for Jane Doe');

    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn.getAttribute('aria-label')).toBe('Cancel appointment for Jane Doe');
  });

  it('should render descriptive aria-label for empty slot buttons', () => {
    const emptySlotBtn = fixture.nativeElement.querySelector('.dv-empty-slot');
    expect(emptySlotBtn).not.toBeNull();
    expect(emptySlotBtn.getAttribute('aria-label')).toBe('Book appointment at 9:30 AM');
  });
});
