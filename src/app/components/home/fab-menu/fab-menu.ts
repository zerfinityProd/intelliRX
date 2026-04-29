import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserPermissions } from '../../../services/authorizationService';

@Component({
  selector: 'app-fab-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fab-menu.html',
  styleUrl: './fab-menu.css',
  encapsulation: ViewEncapsulation.None
})
export class FabMenuComponent {
  @Input() isFabOpen: boolean = false;
  @Input() permissions!: UserPermissions;

  @Output() toggleFabClicked = new EventEmitter<void>();
  @Output() addAppointmentClicked = new EventEmitter<void>();
  @Output() addPatientClicked = new EventEmitter<void>();
}
