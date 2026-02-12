import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditPatientInfoComponent } from './edit-patient-info';

describe('EditPatientInfoComponent', () => {
  let component: EditPatientInfoComponent;
  let fixture: ComponentFixture<EditPatientInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPatientInfoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditPatientInfoComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});