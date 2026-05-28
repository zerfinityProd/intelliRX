import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyLeaves } from './my-leaves';

describe('MyLeaves', () => {
  let component: MyLeaves;
  let fixture: ComponentFixture<MyLeaves>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyLeaves]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyLeaves);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
