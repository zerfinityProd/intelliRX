import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceptionHome } from './reception-home';

describe('ReceptionHome', () => {
  let component: ReceptionHome;
  let fixture: ComponentFixture<ReceptionHome>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceptionHome]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReceptionHome);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
