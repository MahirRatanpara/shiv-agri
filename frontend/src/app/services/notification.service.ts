import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject, interval, map, takeUntil, switchMap } from 'rxjs';
import { environment } from '../environments/environment';
import { Notification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private apiUrl = `${environment.apiUrl}/notifications`;
  private destroy$ = new Subject<void>();

  unreadCount$ = new BehaviorSubject<number>(0);

  constructor(private http: HttpClient) {
    this.startPolling();
  }

  private startPolling(): void {
    interval(30000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.getUnreadCount())
    ).subscribe(count => this.unreadCount$.next(count));
  }

  getNotifications(page = 1, limit = 20, unreadOnly = false): Observable<{ notifications: Notification[]; pagination: any }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (unreadOnly) params = params.set('unreadOnly', 'true');

    return this.http.get<any>(this.apiUrl, { params }).pipe(
      map(res => ({ notifications: res.data || [], pagination: res.pagination }))
    );
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<{ success: boolean; data: { count: number } }>(`${this.apiUrl}/unread-count`).pipe(
      map(res => res.data.count)
    );
  }

  markAsRead(id: string): Observable<Notification> {
    return this.http.put<{ success: boolean; data: Notification }>(`${this.apiUrl}/${id}/read`, {}).pipe(
      map(res => res.data)
    );
  }

  markAllAsRead(): Observable<any> {
    return this.http.put<{ success: boolean }>(`${this.apiUrl}/read-all`, {}).pipe(
      map(res => res)
    );
  }

  deleteNotification(id: string): Observable<any> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/${id}`).pipe(
      map(res => res)
    );
  }

  refreshUnreadCount(): void {
    this.getUnreadCount().subscribe(count => this.unreadCount$.next(count));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
