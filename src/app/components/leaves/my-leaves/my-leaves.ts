import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LeaveService } from '../../../services/leave';
import { Leave } from '../../../models/leave.model';
import { AuthenticationService } from '../../../services/authenticationService';
import { ClinicContextService } from '../../../services/clinicContextService';

@Component({
  selector: 'app-my-leaves',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-leaves.html',
  styleUrl: './my-leaves.css'
})
export class MyLeavesComponent implements OnInit {
  leaves: Leave[] = [];
  isSubmitting = false;

  newLeave = {
    date: '',
    timing: 'All Day' as 'All Day' | 'FH' | 'SH'
  };

  minDate = new Date().toISOString().split('T')[0];

  constructor(
    private leaveService: LeaveService,
    private auth: AuthenticationService,
    private clinicContext: ClinicContextService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadLeaves();
  }

  async loadLeaves() {
    this.leaves = await this.leaveService.getMyLeaves();
    // sort by date descending
    this.leaves.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async applyLeave() {
    if (!this.newLeave.date) return;
    
    const userId = this.auth.getCurrentUserId();
    const clinicId = this.clinicContext.getSelectedClinicId();
    
    if (!userId || !clinicId) {
      alert('Error: missing user or clinic context');
      return;
    }

    this.isSubmitting = true;
    try {
      await this.leaveService.addLeave({
        user_id: userId,
        clinic_id: clinicId,
        date: this.newLeave.date,
        timing: this.newLeave.timing,
        status: 'approved' // auto approve for now
      });
      
      this.newLeave.date = '';
      this.newLeave.timing = 'All Day';
      await this.loadLeaves();
    } catch (e) {
      console.error(e);
      alert('Failed to apply leave');
    } finally {
      this.isSubmitting = false;
    }
  }

  async cancelLeave(id: string) {
    if (!confirm('Are you sure you want to cancel this leave?')) return;
    try {
      await this.leaveService.deleteLeave(id);
      await this.loadLeaves();
    } catch (e) {
      alert('Failed to cancel leave');
    }
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
