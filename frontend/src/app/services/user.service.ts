import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  profilePhoto?: string;
  roleRef?: {
    name: string;
    displayName: string;
  };
  createdAt: Date;
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}

export interface GetUsersResponse {
  users: User[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface GetUserResponse {
  user: User;
}

export interface UpdateUserRoleResponse {
  message: string;
  user: User;
  role: {
    name: string;
    displayName: string;
    permissionCount: number;
  };
}

export interface DeleteUserResponse {
  message: string;
  deletedUser: {
    id: string;
    name: string;
    email: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getAllUsers(params: GetUsersParams = {}): Observable<GetUsersResponse> {
    let httpParams = new HttpParams();

    if (params.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    if (params.search) {
      httpParams = httpParams.set('search', params.search);
    }
    if (params.role) {
      httpParams = httpParams.set('role', params.role);
    }

    return this.http.get<GetUsersResponse>(this.apiUrl, { params: httpParams });
  }

  getUser(id: string): Observable<GetUserResponse> {
    return this.http.get<GetUserResponse>(`${this.apiUrl}/${id}`);
  }

  updateUserRole(userId: string, roleName: string): Observable<UpdateUserRoleResponse> {
    return this.http.put<UpdateUserRoleResponse>(
      `${this.apiUrl}/${userId}/role`,
      { role: roleName }
    );
  }

  deleteUser(userId: string): Observable<DeleteUserResponse> {
    return this.http.delete<DeleteUserResponse>(`${this.apiUrl}/${userId}`);
  }
}
