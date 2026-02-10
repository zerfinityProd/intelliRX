import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PatientDetailsComponent } from './patient-details';

// Disable tests - they should only run with 'ng test', not 'ng serve'
describe('PatientDetailsComponent', () => {
  let component: PatientDetailsComponent;
  let fixture: ComponentFixture<PatientDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientDetailsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PatientDetailsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});