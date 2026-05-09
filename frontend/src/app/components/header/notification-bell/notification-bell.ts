import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { AppNotification, NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css'
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  notifications: AppNotification[] = [];
  unreadCount = 0;
  isOpen = false;
  isLoading = false;
  isMarkingAll = false;

  constructor(
    private notificationService: NotificationService,
    private router: Router,
    private hostRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    const target = event.target as Node | null;
    if (target && !this.hostRef.nativeElement.contains(target)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.isOpen = false;
  }

  toggleOpen(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) this.loadNotifications();
  }

  loadNotifications(): void {
    this.isLoading = true;
    this.notificationService.getNotifications()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.notifications = result.notifications;
          this.unreadCount = result.unreadCount;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        }
      });
  }

  openRequest(notification: AppNotification): void {
    const projectId = this.projectId(notification);
    if (!projectId) return;
    this.markRead(notification.id);
    this.isOpen = false;

    const queryParams: Record<string, string> = { from: 'notification' };
    if (notification.type === 'farm_media_upload') {
      queryParams['tab'] = 'media';
    }

    this.router.navigate(['/farm-management/project', projectId], { queryParams });
  }

  ctaLabelFor(notification: AppNotification): string {
    switch (notification.type) {
      case 'farm_media_upload': return 'Review Photos';
      case 'farm_registration': return 'Review Request';
      case 'farm_approved':
      case 'farm_rejected': return 'View Project';
      default: return 'Open';
    }
  }

  hasCta(notification: AppNotification): boolean {
    return !!this.projectId(notification) && notification.type !== 'system';
  }

  archive(notification: AppNotification): void {
    this.removeOptimistically(notification.id);
    this.notificationService.archive(notification.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: () => this.loadNotifications()
      });
  }

  markAllAsRead(): void {
    const unread = this.notifications.filter((notification) => !notification.isRead);
    if (!unread.length || this.isMarkingAll) return;

    this.isMarkingAll = true;
    forkJoin(unread.map((notification) => this.notificationService.markRead(notification.id)))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifications = this.notifications.map((notification) => ({ ...notification, isRead: true }));
          this.unreadCount = 0;
          this.isMarkingAll = false;
        },
        error: () => {
          this.isMarkingAll = false;
          this.loadNotifications();
        }
      });
  }

  iconFor(notification: AppNotification): string {
    switch (notification.type) {
      case 'farm_registration': return 'fa-seedling';
      case 'farm_approved': return 'fa-circle-check';
      case 'farm_rejected': return 'fa-circle-xmark';
      case 'farm_media_upload': return 'fa-images';
      default: return 'fa-bell';
    }
  }

  iconClassFor(notification: AppNotification): string {
    return `notif-icon icon-${notification.type || 'system'}`;
  }

  relativeTime(input?: string): string {
    if (!input) return '';
    const created = new Date(input).getTime();
    if (Number.isNaN(created)) return '';
    const diff = Date.now() - created;
    const sec = Math.max(1, Math.floor(diff / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(input).toLocaleDateString();
  }

  trackById(_: number, notification: AppNotification): string {
    return notification.id;
  }

  private projectId(notification: AppNotification): string | null {
    return notification.project?.id || notification.project?._id || null;
  }

  private markRead(notificationId: string): void {
    this.notificationService.markRead(notificationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const target = this.notifications.find((notification) => notification.id === notificationId);
          if (target) target.isRead = true;
          this.unreadCount = this.notifications.filter((notification) => !notification.isRead).length;
        },
        error: () => {}
      });
  }

  private removeOptimistically(notificationId: string): void {
    this.notifications = this.notifications.filter((notification) => notification.id !== notificationId);
    this.unreadCount = this.notifications.filter((notification) => !notification.isRead).length;
  }
}
