import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentsList } from './appointments-list';

describe('AppointmentsList', () => {
  let component: AppointmentsList;
  let fixture: ComponentFixture<AppointmentsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentsList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentsList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
