import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddVisitPage } from './add-visit-page';

describe('AddVisitPage', () => {
  let component: AddVisitPage;
  let fixture: ComponentFixture<AddVisitPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddVisitPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddVisitPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
