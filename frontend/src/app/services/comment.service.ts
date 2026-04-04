import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';
import { Comment } from '../models/comment.model';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private apiUrl = `${environment.apiUrl}/comments`;

  constructor(private http: HttpClient) {}

  getComments(projectId: string, page = 1, limit = 20): Observable<{ comments: Comment[]; pagination: any }> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<any>(`${this.apiUrl}/project/${projectId}`, { params }).pipe(
      map(res => ({ comments: res.data || [], pagination: res.pagination }))
    );
  }

  createComment(data: Partial<Comment>): Observable<Comment> {
    return this.http.post<{ success: boolean; data: Comment }>(this.apiUrl, data).pipe(
      map(res => res.data)
    );
  }

  updateComment(id: string, content: string): Observable<Comment> {
    return this.http.put<{ success: boolean; data: Comment }>(`${this.apiUrl}/${id}`, { content }).pipe(
      map(res => res.data)
    );
  }

  deleteComment(id: string): Observable<any> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/${id}`).pipe(
      map(res => res)
    );
  }

  addReaction(id: string, emoji: string): Observable<Comment> {
    return this.http.post<{ success: boolean; data: Comment }>(`${this.apiUrl}/${id}/reactions`, { emoji }).pipe(
      map(res => res.data)
    );
  }

  getReplies(id: string): Observable<Comment[]> {
    return this.http.get<{ success: boolean; data: Comment[] }>(`${this.apiUrl}/${id}/replies`).pipe(
      map(res => res.data || [])
    );
  }
}
