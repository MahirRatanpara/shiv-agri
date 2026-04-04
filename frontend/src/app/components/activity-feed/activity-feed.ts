import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Activity, Pagination } from '../../models/project.model';
import { ProjectService } from '../../services/project.service';

interface ActionTypeConfig {
  icon: string;
  color: string;
}

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-feed.html',
  styleUrl: './activity-feed.css'
})
export class ActivityFeedComponent implements OnInit, OnDestroy, OnChanges {
  @Input() projectId!: string;
  @Input() limit: number = 20;

  activities: Activity[] = [];
  pagination: Pagination | null = null;
  loading = false;
  loadingMore = false;
  currentPage = 1;

  private destroy$ = new Subject<void>();

  private actionTypeMap: Record<string, ActionTypeConfig> = {
    'project.create': { icon: 'fas fa-plus-circle', color: '#22c55e' },
    'project.update': { icon: 'fas fa-edit', color: '#3b82f6' },
    'project.delete': { icon: 'fas fa-trash', color: '#ef4444' },
    'transaction.create': { icon: 'fas fa-receipt', color: '#22c55e' },
    'transaction.delete': { icon: 'fas fa-receipt', color: '#ef4444' },
    'visit.create': { icon: 'fas fa-calendar-check', color: '#22c55e' },
    'visit.complete': { icon: 'fas fa-check-circle', color: '#22c55e' },
    'contact.add': { icon: 'fas fa-user-plus', color: '#3b82f6' },
    'milestone.update': { icon: 'fas fa-flag', color: '#eab308' }
  };

  private defaultAction: ActionTypeConfig = { icon: 'fas fa-circle', color: '#9ca3af' };

  constructor(private projectService: ProjectService) {}

  ngOnInit(): void {
    if (this.projectId) {
      this.loadActivities();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange) {
      this.activities = [];
      this.currentPage = 1;
      this.loadActivities();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadActivities(): void {
    this.loading = true;
    this.projectService
      .getActivity(this.projectId, this.currentPage, this.limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ activities, pagination }) => {
          this.activities = activities;
          this.pagination = pagination;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });
  }

  loadMore(): void {
    if (!this.pagination?.hasNext || this.loadingMore) return;

    this.loadingMore = true;
    this.currentPage++;

    this.projectService
      .getActivity(this.projectId, this.currentPage, this.limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ activities, pagination }) => {
          this.activities = [...this.activities, ...activities];
          this.pagination = pagination;
          this.loadingMore = false;
        },
        error: () => {
          this.currentPage--;
          this.loadingMore = false;
        }
      });
  }

  getActionConfig(actionType: string): ActionTypeConfig {
    return this.actionTypeMap[actionType] || this.defaultAction;
  }

  getUserInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  timeAgo(date: string): string {
    const now = Date.now();
    const then = new Date(date).getTime();
    const seconds = Math.floor((now - then) / 1000);

    if (seconds < 0) return 'just now';

    const intervals: [number, string][] = [
      [31536000, 'year'],
      [2592000, 'month'],
      [604800, 'week'],
      [86400, 'day'],
      [3600, 'hour'],
      [60, 'minute']
    ];

    for (const [secs, label] of intervals) {
      const count = Math.floor(seconds / secs);
      if (count >= 1) {
        return count === 1 ? `1 ${label} ago` : `${count} ${label}s ago`;
      }
    }

    return 'just now';
  }
}
