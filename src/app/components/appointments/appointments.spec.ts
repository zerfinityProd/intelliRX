import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppointmentsComponent } from './appointments';

describe('AppointmentsComponent', () => {
  let component: AppointmentsComponent;
  let fixture: ComponentFixture<AppointmentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
