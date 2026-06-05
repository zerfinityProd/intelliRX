import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyLeavesComponent } from './my-leaves';

describe('MyLeavesComponent', () => {
  let component: MyLeavesComponent;
  let fixture: ComponentFixture<MyLeavesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyLeavesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyLeavesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
