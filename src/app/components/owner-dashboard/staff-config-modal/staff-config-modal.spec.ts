import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StaffConfigModal } from './staff-config-modal';

describe('StaffConfigModal', () => {
  let component: StaffConfigModal;
  let fixture: ComponentFixture<StaffConfigModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffConfigModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StaffConfigModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
