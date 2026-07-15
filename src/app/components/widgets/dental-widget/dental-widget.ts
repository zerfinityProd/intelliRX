import {
    Component, Output, EventEmitter, Input,
    OnChanges, SimpleChanges, AfterViewInit, ElementRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-dental-widget',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './dental-widget.html',
    styleUrls: ['./dental-widget.css']
})
export class DentalWidgetComponent implements OnChanges, AfterViewInit {

    /** Pre-selected tooth IDs (e.g. loaded from a saved visit) */
    @Input() initialSelected: number[] = [];
    @Input() initialNotes: { [id: number]: string } = {};

    /** Emits the full array of currently selected tooth IDs whenever it changes */
    @Output() selectionChange = new EventEmitter<number[]>();
    @Output() notesChange = new EventEmitter<{ [id: number]: string }>();

    private selectedTeeth: Set<number> = new Set();
    private viewInitialized = false;

    /** Timer used to debounce single-click so double-click can cancel it */
    private clickTimer: ReturnType<typeof setTimeout> | null = null;

    /** Per-tooth notes */
    toothNotes: { [id: number]: string } = {};

    /** Current view mode */
    currentMode: 'chart' | 'notes' = 'chart';

    private readonly el = inject(ElementRef);

    get selectedTeethArray(): number[] {
        return Array.from(this.selectedTeeth);
    }

    get selectedCount(): number {
        return this.selectedTeeth.size;
    }

    setMode(mode: 'chart' | 'notes') {
        this.currentMode = mode;
    }

    onNoteChange(toothId: number, note: string): void {
        if (note.trim()) {
            this.toothNotes[toothId] = note;
        } else {
            delete this.toothNotes[toothId];
        }
        this.notesChange.emit({ ...this.toothNotes });
    }

    ngAfterViewInit(): void {
        this.viewInitialized = true;
        if (this.initialSelected?.length) {
            this.applyInitialSelection(this.initialSelected);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['initialSelected'] && this.viewInitialized) {
            this.selectedTeeth.clear();
            this.clearAllSelectedClasses();
            if (this.initialSelected?.length) {
                this.applyInitialSelection(this.initialSelected);
            }
        }
        if (changes['initialNotes'] && this.initialNotes) {
            this.toothNotes = { ...this.initialNotes };
        }
    }

    // ── Event delegation on the SVG root ──────────────────────

    /** Single click → select the tooth after a short delay.
     *  The delay is cancelled when a double-click follows within the window,
     *  preventing the first click of a dblclick from racing with deselection. */
    onSvgClick(event: MouseEvent): void {
        const id = this.getToothIdFromEvent(event);
        if (id === null) return;

        // Cancel any pending single-click action
        if (this.clickTimer !== null) {
            clearTimeout(this.clickTimer);
            this.clickTimer = null;
        }

        // Schedule the select action — will be cancelled if dblclick fires first
        this.clickTimer = setTimeout(() => {
            this.clickTimer = null;
            if (!this.selectedTeeth.has(id)) {
                this.selectedTeeth.add(id);
                this.setGroupClass(id, true);
                this.selectionChange.emit(Array.from(this.selectedTeeth));
            }
        }, 220);
    }

    /** Double click → cancel the pending single-click and deselect the tooth */
    onSvgDblClick(event: MouseEvent): void {
        event.preventDefault();

        // Cancel the single-click timer so it doesn't re-select after deselect
        if (this.clickTimer !== null) {
            clearTimeout(this.clickTimer);
            this.clickTimer = null;
        }

        const id = this.getToothIdFromEvent(event);
        if (id !== null && this.selectedTeeth.has(id)) {
            this.selectedTeeth.delete(id);
            this.setGroupClass(id, false);
            // Clear note when tooth deselected
            delete this.toothNotes[id];
            this.notesChange.emit({ ...this.toothNotes });
            this.selectionChange.emit(Array.from(this.selectedTeeth));
        }
    }

    clearSelection(): void {
        this.selectedTeeth.clear();
        this.clearAllSelectedClasses();
        this.toothNotes = {};
        this.selectionChange.emit([]);
        this.notesChange.emit({});
    }

    // ── Helpers ───────────────────────────────────────────────

    private getToothIdFromEvent(event: MouseEvent): number | null {
        let target = event.target as Element | null;
        while (target && target.tagName.toLowerCase() !== 'svg') {
            if (target.tagName.toLowerCase() === 'g') {
                const id = parseInt((target as HTMLElement).id, 10);
                if (!isNaN(id) && id > 0) return id;
            }
            target = target.parentElement;
        }
        return null;
    }

    private setGroupClass(toothId: number, selected: boolean): void {
        const group = this.el.nativeElement.querySelector(`g[id="${toothId}"]`) as HTMLElement | null;
        if (group) {
            if (selected) {
                group.classList.remove('tooth-hover');
                group.classList.add('selected');
            } else {
                group.classList.remove('selected');
            }
        }
    }

    private applyInitialSelection(ids: number[]): void {
        ids.forEach(id => {
            this.selectedTeeth.add(id);
            this.setGroupClass(id, true);
        });
    }

    private clearAllSelectedClasses(): void {
        const groups = this.el.nativeElement.querySelectorAll('g.selected');
        groups.forEach((g: Element) => g.classList.remove('selected'));
    }

    // ── Mouse hover handlers ──────────────────────────────────────────
    private findGroupFromTarget(target: any): HTMLElement | null {
        let el = target as HTMLElement | null;
        while (el && el.tagName?.toLowerCase() !== 'svg') {
            if (el.tagName?.toLowerCase() === 'g' && el.id && !isNaN(parseInt(el.id, 10))) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    onMouseEnter(element: any): void {
        const group = this.findGroupFromTarget(element);
        if (!group || group.classList.contains('selected')) return;
        group.classList.add('tooth-hover');
    }

    onMouseLeave(element: any): void {
        const group = this.findGroupFromTarget(element);
        if (!group) return;
        group.classList.remove('tooth-hover');
    }
}