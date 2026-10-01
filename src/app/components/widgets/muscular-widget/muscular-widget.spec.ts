import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MuscularWidgetComponent } from './muscular-widget';

describe('MuscularWidgetComponent', () => {
    let component: MuscularWidgetComponent;
    let fixture: ComponentFixture<MuscularWidgetComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MuscularWidgetComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(MuscularWidgetComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should toggle muscle selection', () => {
        const testMuscle = 'muscle_temporalis_left';
        expect(component.selectedMuscles.includes(testMuscle)).toBeFalsy();

        component.toggleSelection(testMuscle);
        expect(component.selectedMuscles.includes(testMuscle)).toBeTruthy();

        component.toggleSelection(testMuscle);
        expect(component.selectedMuscles.includes(testMuscle)).toBeFalsy();
    });
});
