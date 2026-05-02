import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-rh-hero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rh-hero.html',
  styleUrl: './rh-hero.css',
  encapsulation: ViewEncapsulation.None
})
export class RhHeroComponent {
  @Input() greeting: string = '';
  @Input() userName: string = '';
  @Input() todayCount: number = 0;
  @Input() scheduledCount: number = 0;
  @Input() completedTodayCount: number = 0;
  @Input() isLoading: boolean = false;

  @Output() bookNewClicked = new EventEmitter<void>();
}
