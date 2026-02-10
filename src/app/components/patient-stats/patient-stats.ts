import { Component, Input, OnChanges, SimpleChanges, ViewChild, ElementRef, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Patient, Visit } from '../../models/patient.model';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

interface StatsData {
  totalVisits: number;
  lastVisitDate: string;
  allergiesCount: number;
  averageVisitsPerMonth: number;
}

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasVisit: boolean;
  visitCount: number;
  visits: Visit[];
}


interface MonthlyVisitData {
  month: string;
  count: number;
}

@Component({
  selector: 'app-patient-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-stats.html',
  styleUrl: './patient-stats.css'
})
export class PatientStatsComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() patient: Patient | null = null;
  @Input() visits: Visit[] = [];
  
  @ViewChild('visitTrendChart') visitTrendChartRef!: ElementRef<HTMLCanvasElement>;
  
  stats: StatsData = {
    totalVisits: 0,
    lastVisitDate: 'N/A',
    allergiesCount: 0,
    averageVisitsPerMonth: 0
  };
  
  // Calendar properties
  currentMonth: Date = new Date();
  calendarDays: CalendarDay[] = [];
  monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Modal properties
  showVisitModal: boolean = false;
  selectedDateVisits: Visit[] = [];
  selectedDate: Date | null = null;
  
  // Chart properties
  private visitTrendChart: Chart | null = null;
  monthlyVisitsData: MonthlyVisitData[] = [];
  allergiesList: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patient'] || changes['visits']) {
      this.calculateStats();
      this.generateCalendar();
      this.prepareAllergiesList();
      this.prepareMonthlyVisitsData();
      
      // Update chart after a small delay to ensure DOM is ready
      setTimeout(() => {
        if (this.visitTrendChart) {
          this.updateVisitTrendChart();
        } else if (this.visitTrendChartRef) {
          this.createVisitTrendChart();
        }
      }, 100);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.createVisitTrendChart();
    }, 200);
  }

  private calculateStats(): void {
    if (!this.patient) return;

    // Total visits
    this.stats.totalVisits = this.visits.length;

    // Last visit date
    if (this.visits.length > 0) {
      const lastVisit = this.visits[0];
      this.stats.lastVisitDate = this.formatDate(lastVisit.createdAt);
    }

    // Allergies count
    if (this.patient.allergies) {
      this.stats.allergiesCount = this.patient.allergies.split(',').filter(a => a.trim()).length;
    }

    // Average visits per month
    if (this.visits.length > 0) {
      const firstVisit = new Date(this.visits[this.visits.length - 1].createdAt);
      const lastVisit = new Date(this.visits[0].createdAt);
      const monthsDiff = this.getMonthsDifference(firstVisit, lastVisit) || 1;
      this.stats.averageVisitsPerMonth = Number((this.visits.length / monthsDiff).toFixed(1));
    }
  }

  private prepareAllergiesList(): void {
    if (!this.patient || !this.patient.allergies) {
      this.allergiesList = [];
      return;
    }

    this.allergiesList = this.patient.allergies.split(',').map(a => a.trim()).filter(a => a);
  }

  private prepareMonthlyVisitsData(): void {
    if (!this.visits || this.visits.length === 0) {
      this.monthlyVisitsData = [];
      return;
    }

    // Get last 6 months
    const now = new Date();
    const monthsData: { [key: string]: number } = {};
    
    // Initialize last 6 months with 0
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const monthLabel = `${this.monthNames[date.getMonth()].substring(0, 3)} ${date.getFullYear()}`;
      monthsData[monthKey] = 0;
    }
    
    // Count visits per month
    this.visits.forEach(visit => {
      let visitDate: Date;
      if (visit.createdAt && typeof (visit.createdAt as any).toDate === 'function') {
        visitDate = (visit.createdAt as any).toDate();
      } else {
        visitDate = new Date(visit.createdAt);
      }
      
      const monthKey = `${visitDate.getFullYear()}-${(visitDate.getMonth() + 1).toString().padStart(2, '0')}`;
      if (monthsData.hasOwnProperty(monthKey)) {
        monthsData[monthKey]++;
      }
    });
    
    // Convert to array for chart
    this.monthlyVisitsData = Object.keys(monthsData).map(key => {
      const [year, month] = key.split('-');
      const monthIndex = parseInt(month) - 1;
      const monthLabel = `${this.monthNames[monthIndex].substring(0, 3)}`;
      
      return {
        month: monthLabel,
        count: monthsData[key]
      };
    });
  }

  private createVisitTrendChart(): void {
    if (!this.visitTrendChartRef?.nativeElement || this.monthlyVisitsData.length === 0) {
      return;
    }

    const ctx = this.visitTrendChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    // Destroy existing chart if any
    if (this.visitTrendChart) {
      this.visitTrendChart.destroy();
    }

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: this.monthlyVisitsData.map(d => d.month),
        datasets: [{
          label: 'Visits',
          data: this.monthlyVisitsData.map(d => d.count),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: '#6366f1',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1e293b',
            padding: 12,
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: {
              size: 13
            },
            borderColor: '#6366f1',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: function(context: any) {
                return `${context.parsed.y} visit${context.parsed.y !== 1 ? 's' : ''}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#64748b',
              font: {
                size: 12
              }
            },
            grid: {
              color: '#f1f5f9',
              drawBorder: false
            }
          },
          x: {
            ticks: {
              color: '#64748b',
              font: {
                size: 12
              }
            },
            grid: {
              display: false
            }
          }
        }
      } as any
    };

    this.visitTrendChart = new Chart(ctx, config);
  }

  private updateVisitTrendChart(): void {
    if (!this.visitTrendChart || this.monthlyVisitsData.length === 0) {
      if (this.visitTrendChartRef) {
        this.createVisitTrendChart();
      }
      return;
    }

    this.visitTrendChart.data.labels = this.monthlyVisitsData.map(d => d.month);
    this.visitTrendChart.data.datasets[0].data = this.monthlyVisitsData.map(d => d.count);
    this.visitTrendChart.update();
  }

  private generateCalendar(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay();
    
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Days from previous month
    const prevMonthDays = firstDayOfWeek;
    const prevMonth = new Date(year, month, 0);
    const prevMonthLastDay = prevMonth.getDate();
    
    // Days for next month
    const totalCells = Math.ceil((daysInMonth + prevMonthDays) / 7) * 7;
    const nextMonthDays = totalCells - (daysInMonth + prevMonthDays);
    
    this.calendarDays = [];
    
    // Previous month days
    for (let i = prevMonthDays - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      this.calendarDays.push(this.createCalendarDay(date, false));
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      this.calendarDays.push(this.createCalendarDay(date, true));
    }
    
    // Next month days
    for (let i = 1; i <= nextMonthDays; i++) {
      const date = new Date(year, month + 1, i);
      this.calendarDays.push(this.createCalendarDay(date, false));
    }
  }

  private createCalendarDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    const dayVisits = this.getVisitsForDate(date);
    const today = new Date();
    const isToday = date.getDate() === today.getDate() &&
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();
    
    
    return {
      date,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday,
      hasVisit: dayVisits.length > 0,
      visitCount: dayVisits.length,
      visits: dayVisits
    };
  }

  private getVisitsForDate(date: Date): Visit[] {
    return this.visits.filter(visit => {
      let visitDate: Date;
      if (visit.createdAt && typeof (visit.createdAt as any).toDate === 'function') {
        visitDate = (visit.createdAt as any).toDate();
      } else {
        visitDate = new Date(visit.createdAt);
      }
      
      return visitDate.getDate() === date.getDate() &&
             visitDate.getMonth() === date.getMonth() &&
             visitDate.getFullYear() === date.getFullYear();
    });
  }

  previousMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.generateCalendar();
  }

  onDateClick(day: CalendarDay): void {
    if (day.hasVisit) {
      this.selectedDate = day.date;
      this.selectedDateVisits = day.visits;
      this.showVisitModal = true;
    }
  }

  closeModal(): void {
    this.showVisitModal = false;
    this.selectedDateVisits = [];
    this.selectedDate = null;
  }

  get currentMonthYear(): string {
    return `${this.monthNames[this.currentMonth.getMonth()]} ${this.currentMonth.getFullYear()}`;
  }

  private getMonthsDifference(date1: Date, date2: Date): number {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12 + 
                   (date2.getMonth() - date1.getMonth());
    return Math.max(months, 1);
  }

  formatDate(date: Date | any): string {
    if (!date) return 'N/A';
    
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatDateTime(date: Date | any): string {
    if (!date) return 'N/A';
    
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDateOfBirth(date: Date | any): string {
    if (!date) return 'N/A';
    
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  ngOnDestroy(): void {
    if (this.visitTrendChart) {
      this.visitTrendChart.destroy();
    }
  }
}