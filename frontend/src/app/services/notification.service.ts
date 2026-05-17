import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type AppNotificationType =
  | 'farm_registration'
  | 'farm_approved'
  | 'farm_rejected'
  | 'farm_media_upload'
  | 'farm_quotation_required'
  | 'farm_quotation_received'
  | 'farm_quotation_accepted'
  | 'system';

export interface AppNotification {
  id: string;
  _id?: string;
  type: AppNotificationType;
  title: string;
  message: string;
  project?: { _id: string; id?: string; name: string; status: string; rejectedReason?: string };
  submittingUser?: { _id: string; name: string; email: string };
  metadata?: {
    farmName?: string;
    submitterName?: string;
    rejectionReason?: string;
    uploaderName?: string;
    mediaCount?: number;
    quotationId?: string;
    amountPerYear?: number;
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
