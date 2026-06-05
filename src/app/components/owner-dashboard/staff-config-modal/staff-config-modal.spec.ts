import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StaffConfigModalComponent } from './staff-config-modal';

describe('StaffConfigModalComponent', () => {
  let component: StaffConfigModalComponent;
  let fixture: ComponentFixture<StaffConfigModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffConfigModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StaffConfigModalComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
