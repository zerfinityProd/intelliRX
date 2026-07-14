import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LeaveService } from '../../../services/leave';
import { Leave } from '../../../models/leave.model';
import { AuthenticationService } from '../../../services/authenticationService';
import { ClinicContextService } from '../../../services/clinicContextService';
import { NavbarComponent } from '../../navbar/navbar';
import { normalizeEmail } from '../../../utilities/normalize-email';

@Component({
  selector: 'app-my-leaves',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './my-leaves.html',
  styleUrl: './my-leaves.css'
})
export class MyLeavesComponent implements OnInit {
  leaves: Leave[] = [];
  isLoading = true;   // true by default → spinner visible immediately
  isSubmitting = false;

  newLeave = {
    date: '',
    timing: 'All Day' as 'All Day' | 'FH' | 'SH'
  };

  dateError = '';

  minDate = new Date().toISOString().split('T')[0];
  maxDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  })();

  constructor(
    private leaveService: LeaveService,
    private auth: AuthenticationService,
    private clinicContext: ClinicContextService,
    private router: Router
  ) {}

  async ngOnInit() {
    // Auth restores the session from local cache synchronously,
    // so getAuthUserEmail() is available here without any extra wait.
    await this.loadLeaves();
  }


  onDateChange(): void {
    this.dateError = '';
    if (!this.newLeave.date) return;
    if (this.newLeave.date < this.minDate) {
      this.dateError = 'Past dates are not allowed. Please choose today or a future date.';
      return;
    }
    if (this.newLeave.date > this.maxDate) {
      this.dateError = 'Date is too far ahead. Leave can be applied up to 1 year in advance.';
      return;
    }
  }

  async loadLeaves() {
    this.isLoading = true;
    try {
      this.leaves = await this.leaveService.getMyLeaves();
      // Sort by date descending (most recent first)
      this.leaves.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (e: any) {
      console.error('Failed to load leaves:', e);
      const { default: Swal } = await import('sweetalert2');
      Swal.fire({
        icon: 'error',
        title: 'Could Not Load Leaves',
        text: e?.message || 'Please check your connection and try again.',
        confirmButtonColor: '#148D9E'
      });
    } finally {
      this.isLoading = false;
    }
  }

  async applyLeave() {
    if (!this.newLeave.date) return;

    // Guard: reject past dates (browser [min] can be bypassed by typing)
    if (this.newLeave.date < this.minDate) {
      const { default: Swal } = await import('sweetalert2');
      Swal.fire({
        icon: 'error',
        title: 'Invalid Date',
        text: 'You cannot apply leave for a past date.',
        confirmButtonColor: '#148D9E'
      });
      this.newLeave.date = '';
      return;
    }

    if (this.newLeave.date > this.maxDate) {
      const { default: Swal } = await import('sweetalert2');
      Swal.fire({
        icon: 'error',
        title: 'Invalid Date',
        text: 'Leave can only be applied up to 1 year in advance.',
        confirmButtonColor: '#148D9E'
      });
      this.newLeave.date = '';
      return;
    }

    // Use normalized email as user_id — consistent with timeSlotService leave checks.
    // Fall back to Firebase Auth email (available from cache immediately).
    const rawEmail = this.auth.currentUserValue?.email
                  || this.auth.getAuthUserEmail()
                  || '';
    const userEmail = normalizeEmail(rawEmail);
    const clinicId = this.clinicContext.getSelectedClinicId();

    if (!userEmail || !clinicId) {
      const { default: Swal } = await import('sweetalert2');
      Swal.fire({
        icon: 'error',
        title: 'Missing Context',
        text: 'Could not determine user or clinic. Please try logging out and back in.',
        confirmButtonColor: '#148D9E'
      });
      return;
    }

    this.isSubmitting = true;
    try {
      // Check for duplicate leave using already-loaded local data (no extra Firestore query)
      const duplicate = this.leaves.find(l =>
        l.date === this.newLeave.date &&
        (l.timing === this.newLeave.timing || l.timing === 'All Day' || this.newLeave.timing === 'All Day')
      );
      if (duplicate) {
        const { default: Swal } = await import('sweetalert2');
        Swal.fire({
          icon: 'warning',
          title: 'Already Applied',
          text: `You already have a ${duplicate.timing} leave on this date.`,
          confirmButtonColor: '#148D9E'
        });
        this.isSubmitting = false;
        return;
      }

      await this.leaveService.addLeave({
        user_id:  userEmail,
        clinic_id: clinicId,
        date:     this.newLeave.date,
        timing:   this.newLeave.timing,
        status:   'approved'
      });

      this.newLeave.date = '';
      this.newLeave.timing = 'All Day';
      await this.loadLeaves();

      const { default: Swal } = await import('sweetalert2');
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      Swal.fire({
        icon: 'success',
        title: 'Leave Applied!',
        text: 'Your leave has been recorded and appointment bookings will be blocked accordingly.',
        confirmButtonColor: '#148D9E',
        background: isDark ? '#1f1f1f' : '#ffffff',
        color: isDark ? '#e0e0e0' : '#1e293b',
      });
    } catch (e: any) {
      console.error('Leave apply error:', e);
      const { default: Swal } = await import('sweetalert2');
      Swal.fire({
        icon: 'error',
        title: 'Failed to Apply Leave',
        text: e?.message || 'An unexpected error occurred. Please try again.',
        confirmButtonColor: '#148D9E'
      });
    } finally {
      this.isSubmitting = false;
    }
  }

  async cancelLeave(id: string) {
    const { default: Swal } = await import('sweetalert2');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const result = await Swal.fire({
      title: 'Cancel Leave?',
      text: 'Are you sure you want to cancel this leave request?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Cancel It',
      cancelButtonText: 'Keep It',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#94a3b8',
      background: isDark ? '#1f1f1f' : '#ffffff',
      color: isDark ? '#e0e0e0' : '#1e293b',
    });
    if (!result.isConfirmed) return;
    try {
      await this.leaveService.deleteLeave(id);
      await this.loadLeaves();
      Swal.fire({
        icon: 'success',
        title: 'Leave Cancelled',
        timer: 1500,
        showConfirmButton: false,
        background: isDark ? '#1f1f1f' : '#ffffff',
        color: isDark ? '#e0e0e0' : '#1e293b'
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Failed',
        text: 'Could not cancel the leave. Please try again.',
        confirmButtonColor: '#148D9E'
      });
    }
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}

