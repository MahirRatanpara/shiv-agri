import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export interface AppNotification {
  id: string;
  _id?: string;
  type: 'farm_registration' | 'farm_approved' | 'farm_rejected' | 'system';
  title: string;
  message: string;
  project?: { _id: string; id?: string; name: string; status: string; rejectedReason?: string };
  submittingUser?: { _id: string; name: string; email: string };
  metadata?: {
    farmName?: string;
    submitterName?: string;
    rejectionReason?: string;
  };
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getNotifications(): Observable<NotificationListResponse> {
    return this.http.get<any>(`${this.apiUrl}/notifications`).pipe(
      map((response) => ({
        unreadCount: response.unreadCount || 0,
        notifications: (response.notifications || []).map((notification: any) => ({
          ...notification,
          id: notification.id || notification._id
        }))
      }))
    );
  }

  markRead(id: string): Observable<AppNotification> {
    return this.http.patch<any>(`${this.apiUrl}/notifications/${id}/read`, {}).pipe(
      map((response) => ({ ...response.data, id: response.data?.id || response.data?._id }))
    );
  }

  archive(id: string): Observable<AppNotification> {
    return this.http.delete<any>(`${this.apiUrl}/notifications/${id}`).pipe(
      map((response) => ({ ...response.data, id: response.data?.id || response.data?._id }))
    );
  }
}
