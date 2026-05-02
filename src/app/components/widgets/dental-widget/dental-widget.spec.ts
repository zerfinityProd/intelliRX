import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DentalWidgetComponent } from './dental-widget';

describe('DentalWidgetComponent', () => {
    let component: DentalWidgetComponent;
    let fixture: ComponentFixture<DentalWidgetComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DentalWidgetComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(DentalWidgetComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
