import { TestBed } from '@angular/core/testing';
import { FirebaseService } from './firebase';

// Disable tests - they should only run with 'ng test', not 'ng serve'
describe('FirebaseService', () => {
  let service: FirebaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FirebaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});