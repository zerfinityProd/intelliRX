import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddVisitPageComponent } from './add-visit-page';

describe('AddVisitPageComponent', () => {
  let component: AddVisitPageComponent;
  let fixture: ComponentFixture<AddVisitPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddVisitPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddVisitPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
