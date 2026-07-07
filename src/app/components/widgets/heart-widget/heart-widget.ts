import {
    Component, Output, EventEmitter, Input,
    OnChanges, SimpleChanges, AfterViewInit, ElementRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export const HEART_REGION_NAMES: { [id: string]: string } = {
    'right-atrium':        'Right Atrium',
    'left-atrium':         'Left Atrium',
    'right-ventricle':     'Right Ventricle',
    'left-ventricle':      'Left Ventricle',
    'aorta':               'Aorta',
    'pulmonary-artery':    'Pulmonary Artery',
    'pulmonary-veins':     'Pulmonary Veins',
    'superior-vena-cava':  'Superior Vena Cava',
    'inferior-vena-cava':  'Inferior Vena Cava',
    'tricuspid-valve':     'Tricuspid Valve',
    'mitral-valve':        'Mitral Valve',
    'aortic-valve':        'Aortic Valve',
    'pulmonary-valve':     'Pulmonary Valve',
};

@Component({
    selector: 'app-heart-widget',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './heart-widget.html',
    styleUrls: ['./heart-widget.css']
})
export class HeartWidgetComponent implements OnChanges, AfterViewInit {

    @Input() initialSelected: string[] = [];
    @Input() initialNotes: { [id: string]: string } = {};

    @Output() selectionChange = new EventEmitter<string[]>();
    @Output() notesChange     = new EventEmitter<{ [id: string]: string }>();

    private selectedRegions   = new Set<string>();
    private viewInitialized   = false;

    regionNotes: { [id: string]: string } = {};
    currentMode: 'chart' | 'notes' = 'chart';

    readonly regionNames = HEART_REGION_NAMES;
    readonly regionKeys  = Object.keys(HEART_REGION_NAMES);

    private readonly el = inject(ElementRef);

    get selectedRegionsArray(): string[] { return Array.from(this.selectedRegions); }
    get selectedCount(): number { return this.selectedRegions.size; }

    setMode(mode: 'chart' | 'notes'): void { this.currentMode = mode; }

    getRegionName(id: string): string { return HEART_REGION_NAMES[id] || id; }

    onNoteChange(regionId: string, note: string): void {
        if (note.trim()) { this.regionNotes[regionId] = note; }
        else { delete this.regionNotes[regionId]; }
        this.notesChange.emit({ ...this.regionNotes });
    }

    ngAfterViewInit(): void {
        this.viewInitialized = true;
        if (this.initialSelected?.length) this.applyInitialSelection(this.initialSelected);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['initialSelected'] && this.viewInitialized) {
            this.selectedRegions.clear();
            this.clearAllSelectedClasses();
            if (this.initialSelected?.length) this.applyInitialSelection(this.initialSelected);
        }
        if (changes['initialNotes'] && this.initialNotes) {
            this.regionNotes = { ...this.initialNotes };
        }
    }

    onSvgClick(event: MouseEvent): void {
        if (event.detail >= 2) return;
        const id = this.getRegionIdFromEvent(event);
        if (id && !this.selectedRegions.has(id)) {
            this.selectedRegions.add(id);
            this.setGroupClass(id, true);
            this.selectionChange.emit(Array.from(this.selectedRegions));
        }
    }

    onSvgDblClick(event: MouseEvent): void {
        event.preventDefault();
        const id = this.getRegionIdFromEvent(event);
        if (id && this.selectedRegions.has(id)) {
            this.selectedRegions.delete(id);
            this.setGroupClass(id, false);
            delete this.regionNotes[id];
            this.notesChange.emit({ ...this.regionNotes });
            this.selectionChange.emit(Array.from(this.selectedRegions));
        }
    }

    clearSelection(): void {
        this.selectedRegions.clear();
        this.clearAllSelectedClasses();
        this.regionNotes = {};
        this.selectionChange.emit([]);
        this.notesChange.emit({});
    }

    private getRegionIdFromEvent(event: MouseEvent): string | null {
        let target = event.target as Element | null;
        while (target && target.tagName.toLowerCase() !== 'svg') {
            if (target.tagName.toLowerCase() === 'g') {
                const id = (target as HTMLElement).id;
                if (id && id in HEART_REGION_NAMES) return id;
            }
            target = target.parentElement;
        }
        return null;
    }

    private setGroupClass(id: string, selected: boolean): void {
        const group = this.el.nativeElement.querySelector(`g[id="${id}"]`) as HTMLElement | null;
        if (!group) return;
        if (selected) { group.classList.remove('hw-hover'); group.classList.add('hw-selected'); }
        else          { group.classList.remove('hw-selected'); }
    }

    private applyInitialSelection(ids: string[]): void {
        ids.forEach(id => { this.selectedRegions.add(id); this.setGroupClass(id, true); });
    }

    private clearAllSelectedClasses(): void {
        this.el.nativeElement.querySelectorAll('g.hw-selected')
            .forEach((g: Element) => g.classList.remove('hw-selected'));
    }

    private findGroupFromTarget(target: any): HTMLElement | null {
        let el = target as HTMLElement | null;
        while (el && el.tagName?.toLowerCase() !== 'svg') {
            if (el.tagName?.toLowerCase() === 'g' && el.id && el.id in HEART_REGION_NAMES) return el;
            el = el.parentElement;
        }
        return null;
    }

    onMouseEnter(element: any): void {
        const g = this.findGroupFromTarget(element);
        if (!g || g.classList.contains('hw-selected')) return;
        g.classList.add('hw-hover');
    }

    onMouseLeave(element: any): void {
        const g = this.findGroupFromTarget(element);
        if (g) g.classList.remove('hw-hover');
    }
}
