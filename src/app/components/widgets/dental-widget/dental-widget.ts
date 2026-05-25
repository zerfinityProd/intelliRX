import {
    Component, Output, EventEmitter, Input,
    OnChanges, SimpleChanges, AfterViewInit, ElementRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-dental-widget',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './dental-widget.html',
    styleUrls: ['./dental-widget.css']
})
export class DentalWidgetComponent implements OnChanges, AfterViewInit {

    /** Pre-selected tooth IDs (e.g. loaded from a saved visit) */
    @Input() initialSelected: number[] = [];

    /** Emits the full array of currently selected tooth IDs whenever it changes */
    @Output() selectionChange = new EventEmitter<number[]>();

    private selectedTeeth: Set<number> = new Set();
    private viewInitialized = false;

    private readonly el = inject(ElementRef);

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
    }

    // ── Event delegation on the SVG root ──────────────────────

    /** Single click → select the tooth (if not already selected) */
    onSvgClick(event: MouseEvent): void {
        // dblclick fires a click first; skip when detail === 2
        if (event.detail >= 2) return;
        const id = this.getToothIdFromEvent(event);
        if (id !== null) {
            if (!this.selectedTeeth.has(id)) {
                this.selectedTeeth.add(id);
                this.setGroupClass(id, true);
                this.selectionChange.emit(Array.from(this.selectedTeeth));
            }
        }
    }

    /** Double click → deselect the tooth */
    onSvgDblClick(event: MouseEvent): void {
        event.preventDefault();
        const id = this.getToothIdFromEvent(event);
        if (id !== null && this.selectedTeeth.has(id)) {
            this.selectedTeeth.delete(id);
            this.setGroupClass(id, false);
            this.selectionChange.emit(Array.from(this.selectedTeeth));
        }
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
        // Use attribute selector — works for all numeric IDs including those starting with digits
        const group = this.el.nativeElement.querySelector(`g[id="${toothId}"]`) as HTMLElement | null;
        if (group) {
            if (selected) {
                group.classList.remove('tooth-hover'); // clear hover when selecting
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
    // Use CSS class 'tooth-hover' instead of inline styles to avoid being
    // overridden by dark-mode !important stroke rules.

    /** Find the nearest ancestor (or self) that is a <g> with a numeric id. */
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