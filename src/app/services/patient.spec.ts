import { TestBed } from '@angular/core/testing';
import { PatientService } from './patient';

// Disable tests - they should only run with 'ng test', not 'ng serve'
describe('PatientService', () => {
  let service: PatientService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PatientService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});