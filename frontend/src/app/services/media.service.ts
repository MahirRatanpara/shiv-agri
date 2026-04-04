import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private mediaUrl = `${environment.apiUrl}/media`;

  constructor(private http: HttpClient) {}

  upload(file: File, projectId: string, category: string = 'general'): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', projectId);
    fd.append('category', category);
    return this.http.post(`${this.mediaUrl}/upload`, fd);
  }

  getByProject(projectId: string): Observable<any> {
    return this.http.get(`${this.mediaUrl}/project/${projectId}`);
  }

  delete(mediaId: string): Observable<any> {
    return this.http.delete(`${this.mediaUrl}/${mediaId}`);
  }

  getUrl(mediaId: string): string {
    return `${this.mediaUrl}/${mediaId}/file`;
  }
}
