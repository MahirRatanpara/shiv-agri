import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { Visit, VisitStats, VisitStatus } from '../../models/visit.model';
import { VisitService } from '../../services/visit.service';

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  visits: Visit[];
}

@Component({
  selector: 'app-visit-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visit-calendar.html',
  styleUrl: './visit-calendar.css'
})
export class VisitCalendarComponent implements OnInit, OnChanges, OnDestroy {
  @Input() projectId!: string;

  @Output() visitClick = new EventEmitter<Visit>();
  @Output() dateClick = new EventEmitter<string>();
  @Output() scheduleVisit = new EventEmitter<void>();

  currentDate = new Date();
  currentMonth = this.currentDate.getMonth();
  currentYear = this.currentDate.getFullYear();
  calendarDays: CalendarDay[] = [];
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  visits: Visit[] = [];
  stats: VisitStats | null = null;
  loading = false;

  private destroy$ = new Subject<void>();

  constructor(private visitService: VisitService) {}

  ngOnInit(): void {
    this.loadCalendar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange) {
      this.loadCalendar();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get monthYearLabel(): string {
    return new Date(this.currentYear, this.currentMonth).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  get upcomingCount(): number {
    const now = new Date();
    return this.visits.filter(v => v.status === 'scheduled' && new Date(v.scheduledDate) >= now).length;
  }

  previousMonth(): void {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.loadCalendar();
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.loadCalendar();
  }

  onVisitClick(visit: Visit, event: Event): void {
    event.stopPropagation();
    this.visitClick.emit(visit);
  }

  onDateClick(day: CalendarDay): void {
    if (!day.isCurrentMonth) return;
    if (day.visits.length === 0) {
      this.dateClick.emit(day.date.toISOString());
    }
  }

  onScheduleVisit(): void {
    this.scheduleVisit.emit();
  }

  getStatusClass(status: VisitStatus): string {
    const map: Record<VisitStatus, string> = {
      scheduled: 'chip-scheduled',
      completed: 'chip-completed',
      cancelled: 'chip-cancelled',
      missed: 'chip-missed',
      in_progress: 'chip-in-progress'
    };
    return map[status] || '';
  }

  getVisitLabel(visit: Visit): string {
    return `#${visit.visitNumber} ${visit.type}`;
  }

  private loadCalendar(): void {
    if (!this.projectId) return;

    this.loading = true;
    this.buildCalendarGrid();

    this.visitService.getVisits(this.projectId, 1, 200)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ visits }) => {
          this.visits = visits;
          this.placeVisitsOnCalendar();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });

    this.visitService.getStats(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => { this.stats = stats; },
        error: () => {}
      });
  }

  private buildCalendarGrid(): void {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.calendarDays = [];

    // Previous month fill
    const prevMonthLastDay = new Date(this.currentYear, this.currentMonth, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const date = new Date(this.currentYear, this.currentMonth - 1, day);
      this.calendarDays.push({ date, day, isCurrentMonth: false, isToday: false, visits: [] });
    }

    // Current month
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(this.currentYear, this.currentMonth, d);
      date.setHours(0, 0, 0, 0);
      this.calendarDays.push({
        date,
        day: d,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        visits: []
      });
    }

    // Next month fill
    const remaining = 7 - (this.calendarDays.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const date = new Date(this.currentYear, this.currentMonth + 1, d);
        this.calendarDays.push({ date, day: d, isCurrentMonth: false, isToday: false, visits: [] });
      }
    }
  }

  private placeVisitsOnCalendar(): void {
    // Reset visits on all days
    this.calendarDays.forEach(d => d.visits = []);

    for (const visit of this.visits) {
      const visitDate = new Date(visit.scheduledDate);
      visitDate.setHours(0, 0, 0, 0);

      const matchingDay = this.calendarDays.find(d => d.date.getTime() === visitDate.getTime());
      if (matchingDay) {
        matchingDay.visits.push(visit);
      }
    }
  }
}
