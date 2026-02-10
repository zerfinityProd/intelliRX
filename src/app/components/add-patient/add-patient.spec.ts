import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddPatientComponent } from './add-patient';

// Disable tests - they should only run with 'ng test', not 'ng serve'
describe('AddPatientComponent', () => {
  let component: AddPatientComponent;
  let fixture: ComponentFixture<AddPatientComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPatientComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AddPatientComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});