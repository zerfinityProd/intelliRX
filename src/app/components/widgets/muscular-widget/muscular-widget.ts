import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BodyChart, ViewSide, BodyState } from 'body-muscles';

@Component({
  selector: 'app-muscular-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './muscular-widget.html',
  styleUrls: ['./muscular-widget.css']
})
export class MuscularWidgetComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('bodyMapContainer') bodyMapContainer!: ElementRef;

  private chart: BodyChart | null = null;
  public currentView: 'FRONT' | 'BACK' | 'SELECTED' = 'FRONT';
  
  public bodyState: BodyState = {};
  
  public activeMuscle: { id: string, name: string, selected: boolean } | null = null;
  public tooltipStyle = { display: 'none', left: '0px', top: '0px' };

  @Input() initialSelected: string[] = [];
  @Output() selectionChange = new EventEmitter<string[]>();

  ngOnInit() {
    this.initialSelected.forEach(id => {
      this.bodyState[id] = { intensity: 0, selected: true };
    });
  }

  ngAfterViewInit() {
    this.initChart();
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  initChart() {
    if (this.chart) {
      this.chart.destroy();
    }
    
    const view = this.currentView === 'FRONT' ? ViewSide.FRONT : ViewSide.BACK;

    this.chart = new BodyChart(this.bodyMapContainer.nativeElement, {
      view: view,
      bodyState: this.bodyState,
      onMuscleClick: (id: string, name: string) => {
        this.toggleSelection(id, name);
      },
      onMuscleHover: (id: string | null) => {
        if (id) {
          const isSelected = !!this.bodyState[id]?.selected;
          this.activeMuscle = { id, name: this.formatName(id), selected: isSelected };
        } else {
          this.activeMuscle = null;
          this.tooltipStyle.display = 'none';
        }
      }
    });
  }

  formatName(id: string): string {
    return id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  setView(view: 'FRONT' | 'BACK' | 'SELECTED') {
    this.currentView = view;
    if (this.chart && view !== 'SELECTED') {
      this.chart.update({ view: view === 'FRONT' ? ViewSide.FRONT : ViewSide.BACK });
    }
  }

  onMouseMove(event: MouseEvent) {
    if (this.activeMuscle) {
      this.tooltipStyle = {
        display: 'block',
        left: (event.clientX + 15) + 'px',
        top: (event.clientY + 15) + 'px'
      };
    } else {
      this.tooltipStyle.display = 'none';
    }
  }

  onMouseLeave() {
    this.activeMuscle = null;
    this.tooltipStyle.display = 'none';
  }

  get selectedMuscles(): string[] {
    return Object.keys(this.bodyState).filter(id => this.bodyState[id]?.selected);
  }

  toggleSelection(id: string, name?: string) {
    const currentState = this.bodyState[id] || { intensity: 0, selected: false };
    
    // Toggle state
    this.bodyState = {
      ...this.bodyState,
      [id]: { ...currentState, selected: !currentState.selected }
    };

    // Update active muscle reference if it matches
    if (this.activeMuscle && this.activeMuscle.id === id) {
      this.activeMuscle.selected = !currentState.selected;
    } else if (name) {
       this.activeMuscle = { id, name, selected: !currentState.selected };
    }

    if (this.chart) {
      this.chart.update({ bodyState: this.bodyState });
    }
    this.selectionChange.emit(this.selectedMuscles);
  }

  clearSelection() {
    this.bodyState = {};
    if (this.activeMuscle) {
      this.activeMuscle.selected = false;
    }
    if (this.chart) {
      this.chart.update({ bodyState: this.bodyState });
    }
    this.selectionChange.emit(this.selectedMuscles);
  }
}
