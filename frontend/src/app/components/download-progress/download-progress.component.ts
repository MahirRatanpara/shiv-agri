import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DownloadProgressService, DownloadProgress } from '../../services/download-progress.service';

@Component({
  selector: 'app-download-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="download-progress-container"
      [class.visible]="progress?.isActive"
      [class.minimized]="isMinimized"
      [class.completed]="progress?.isCompleted"
      [class.error]="progress?.hasError">

      <!-- Minimized View -->
      <div class="minimized-view" *ngIf="isMinimized" (click)="toggleMinimize()">
        <div class="mini-progress-ring">
          <svg viewBox="0 0 36 36">
            <path
              class="circle-bg"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              class="circle-progress"
              [attr.stroke-dasharray]="progressPercent + ', 100'"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span class="mini-count">{{ progress?.current || 0 }}</span>
        </div>
        <i class="fas fa-expand-alt expand-icon"></i>
      </div>

      <!-- Expanded View -->
      <div class="expanded-view" *ngIf="!isMinimized">
        <!-- Header -->
        <div class="progress-header">
          <div class="header-left">
            <div class="pulse-dot" [class.active]="!progress?.isCompleted && !progress?.hasError"></div>
            <span class="header-title">{{ getHeaderTitle() }}</span>
          </div>
          <div class="header-actions">
            <button class="btn-minimize" (click)="toggleMinimize()" title="Minimize">
              <i class="fas fa-minus"></i>
            </button>
            <button
              class="btn-close"
              (click)="close()"
              *ngIf="progress?.isCompleted || progress?.hasError"
              title="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <!-- Progress Content -->
        <div class="progress-content">
          <!-- Circular Progress -->
          <div class="circular-progress">
            <svg viewBox="0 0 100 100">
              <circle
                class="progress-ring-bg"
                cx="50"
                cy="50"
                r="42"
              />
              <circle
                class="progress-ring-fill"
                cx="50"
                cy="50"
                r="42"
                [style.strokeDasharray]="circumference"
                [style.strokeDashoffset]="strokeDashoffset"
              />
            </svg>
            <div class="progress-center">
              <span class="progress-percent">{{ progressPercent }}%</span>
              <span class="progress-count">{{ progress?.current || 0 }}/{{ progress?.total || 0 }}</span>
            </div>
          </div>

          <!-- Current File Info -->
          <div class="current-file" *ngIf="progress?.currentFileName && !progress?.isCompleted">
            <div class="file-icon">
              <i class="fas fa-file-pdf"></i>
            </div>
            <div class="file-info">
              <span class="file-label">Downloading:</span>
              <span class="file-name">{{ progress?.currentFileName }}</span>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="progress-bar-container">
            <div
              class="progress-bar-fill"
              [style.width.%]="progressPercent"
              [class.completed]="progress?.isCompleted">
            </div>
            <div class="progress-particles" *ngIf="!progress?.isCompleted && !progress?.hasError">
              <span class="particle" *ngFor="let p of particles" [style.left.%]="p"></span>
            </div>
          </div>

          <!-- Status Message -->
          <div class="status-message">
            <ng-container *ngIf="progress?.hasError">
              <i class="fas fa-exclamation-circle error-icon"></i>
              <span>{{ progress?.errorMessage || 'Download failed' }}</span>
            </ng-container>
            <ng-container *ngIf="progress?.isCompleted && !progress?.hasError">
              <i class="fas fa-check-circle success-icon"></i>
              <span>All {{ progress?.total }} reports downloaded successfully!</span>
            </ng-container>
            <ng-container *ngIf="!progress?.isCompleted && !progress?.hasError">
              <i class="fas fa-clock time-icon"></i>
              <span>{{ getEstimatedTime() }}</span>
            </ng-container>
          </div>
        </div>

        <!-- Completed Files List (scrollable) -->
        <div class="completed-files" *ngIf="recentFiles.length > 0 && !progress?.isCompleted">
          <div class="completed-files-header">
            <i class="fas fa-check"></i>
            <span>Recently completed</span>
          </div>
          <div class="files-list">
            <div class="file-item" *ngFor="let file of recentFiles; let i = index"
                 [style.animation-delay]="i * 0.1 + 's'">
              <i class="fas fa-file-pdf"></i>
              <span>{{ file }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./download-progress.component.css']
})
export class DownloadProgressComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  progress: DownloadProgress | null = null;
  isMinimized = false;
  recentFiles: string[] = [];
  particles = [10, 30, 50, 70, 90];

  // For circular progress
  readonly circumference = 2 * Math.PI * 42; // 2πr where r=42

  private startTime: number = 0;
  private completedTimes: number[] = [];

  constructor(private downloadProgressService: DownloadProgressService) {}

  ngOnInit(): void {
    this.downloadProgressService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        // Track when download starts
        if (progress.isActive && !this.progress?.isActive) {
          this.startTime = Date.now();
          this.completedTimes = [];
          this.recentFiles = [];
          this.isMinimized = false;
        }

        // Track completed files for time estimation
        if (progress.current > (this.progress?.current || 0)) {
          this.completedTimes.push(Date.now());

          // Add to recent files (keep last 3)
          if (progress.currentFileName) {
            this.recentFiles.unshift(progress.currentFileName);
            if (this.recentFiles.length > 3) {
              this.recentFiles.pop();
            }
          }
        }

        this.progress = progress;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get progressPercent(): number {
    if (!this.progress || this.progress.total === 0) return 0;
    return Math.round((this.progress.current / this.progress.total) * 100);
  }

  get strokeDashoffset(): number {
    const percent = this.progressPercent / 100;
    return this.circumference * (1 - percent);
  }

  getHeaderTitle(): string {
    if (this.progress?.hasError) return 'Download Failed';
    if (this.progress?.isCompleted) return 'Download Complete';
    return this.progress?.title || 'Downloading Reports';
  }

  getEstimatedTime(): string {
    if (!this.progress || this.progress.current === 0) {
      return 'Calculating...';
    }

    const remaining = this.progress.total - this.progress.current;
    if (remaining === 0) return 'Almost done...';

    // Calculate average time per file
    const elapsed = Date.now() - this.startTime;
    const avgTimePerFile = elapsed / this.progress.current;
    const estimatedRemaining = Math.ceil((avgTimePerFile * remaining) / 1000);

    if (estimatedRemaining < 60) {
      return `~${estimatedRemaining}s remaining`;
    } else {
      const minutes = Math.floor(estimatedRemaining / 60);
      const seconds = estimatedRemaining % 60;
      return `~${minutes}m ${seconds}s remaining`;
    }
  }

  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
  }

  close(): void {
    this.downloadProgressService.reset();
  }
}
