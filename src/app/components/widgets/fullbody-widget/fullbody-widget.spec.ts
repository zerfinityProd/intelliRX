import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FullbodyWidgetComponent } from './fullbody-widget';

describe('FullbodyWidgetComponent', () => {
    let component: FullbodyWidgetComponent;
    let fixture: ComponentFixture<FullbodyWidgetComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FullbodyWidgetComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(FullbodyWidgetComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should have exactly 206 bones in the dictionary', () => {
        const boneIds = Object.keys(component.boneNames);
        expect(boneIds.length).toBe(206);
    });

    it('should toggle bone selection', () => {
        const testBone = 'skull_frontal';
        expect(component.isSelected(testBone)).toBeFalsy();

        component.toggleBone(testBone);
        expect(component.isSelected(testBone)).toBeTruthy();

        component.toggleBone(testBone);
        expect(component.isSelected(testBone)).toBeFalsy();
    });
});
