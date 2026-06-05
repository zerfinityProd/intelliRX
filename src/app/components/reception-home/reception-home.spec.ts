import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceptionHomeComponent } from './reception-home';

describe('ReceptionHomeComponent', () => {
  let component: ReceptionHomeComponent;
  let fixture: ComponentFixture<ReceptionHomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceptionHomeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReceptionHomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
