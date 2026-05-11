import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-banner.html',
  styleUrl: './dashboard-banner.css',
  encapsulation: ViewEncapsulation.None
})
export class DashboardBannerComponent {
  @Input() greeting: string = '';
  @Input() userName: string = '';
  @Input() todayCount: number = 0;
  @Input() scheduledCount: number = 0;
  @Input() completedTodayCount: number = 0;
  @Input() isLoading: boolean = false;

  @Output() bookNewClicked = new EventEmitter<void>();
}
