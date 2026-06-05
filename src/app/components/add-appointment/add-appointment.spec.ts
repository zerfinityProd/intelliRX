import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddAppointmentComponent } from './add-appointment';

describe('AddAppointmentComponent', () => {
  let component: AddAppointmentComponent;
  let fixture: ComponentFixture<AddAppointmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddAppointmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddAppointmentComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
