import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClinicConfigModal } from './clinic-config-modal';

describe('ClinicConfigModal', () => {
  let component: ClinicConfigModal;
  let fixture: ComponentFixture<ClinicConfigModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClinicConfigModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClinicConfigModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
