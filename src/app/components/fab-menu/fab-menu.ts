import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserPermissions } from '../../services/authorizationService';

@Component({
  selector: 'app-fab-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fab-menu.html',
  styleUrl: './fab-menu.css',
})
export class FabMenuComponent {
  @Input() permissions!: UserPermissions;

  @Output() addAppointmentClicked = new EventEmitter<void>();
  @Output() addPatientClicked = new EventEmitter<void>();
}
