import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClinicConfigModalComponent } from './clinic-config-modal';

describe('ClinicConfigModalComponent', () => {
  let component: ClinicConfigModalComponent;
  let fixture: ComponentFixture<ClinicConfigModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClinicConfigModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClinicConfigModalComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
