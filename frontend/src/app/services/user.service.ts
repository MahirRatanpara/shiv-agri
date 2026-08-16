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

  /**
   * Admin-only: change a user's identity (name / email / phone). Backend
   * enforces strict uniqueness — the call fails with 409 if the new
   * email/phone is already linked to another account. Pass an empty string
   * to clear a field.
   */
  updateUserIdentity(
    userId: string,
    payload: { name?: string; email?: string | null; phone?: string | null; phoneCountryCode?: string }
  ): Observable<{ success: boolean; user: any; message?: string; projectsUpdated?: number }> {
    return this.http.patch<{ success: boolean; user: any; message?: string; projectsUpdated?: number }>(
      `${this.apiUrl}/${userId}/identity`,
      payload
    );
  }

  /**
   * Admin-only: pre-authorise a new account. Sign-in is invite-only — the login
   * endpoints reject any email/phone with no User record — so this is how
   * someone without a registered farm is given access. At least one of
   * email/phone must be supplied; each must be unused (backend returns 409).
   */
  createUser(payload: {
    name: string;
    email?: string;
    phone?: string;
    phoneCountryCode?: string;
    role?: string;
  }): Observable<{ success: boolean; user: any; message?: string }> {
    return this.http.post<{ success: boolean; user: any; message?: string }>(this.apiUrl, payload);
  }
}
