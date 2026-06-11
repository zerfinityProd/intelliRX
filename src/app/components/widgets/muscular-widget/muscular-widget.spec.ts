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

    it('should have major muscles in the dictionary', () => {
        const muscleIds = Object.keys(component.muscleNames);
        expect(muscleIds.length).toBeGreaterThan(30);
    });

    it('should toggle muscle selection', () => {
        const testMuscle = 'muscle_temporalis_left';
        expect(component.isSelected(testMuscle)).toBeFalsy();

        component.toggleMuscle(testMuscle);
        expect(component.isSelected(testMuscle)).toBeTruthy();

        component.toggleMuscle(testMuscle);
        expect(component.isSelected(testMuscle)).toBeFalsy();
    });
});
