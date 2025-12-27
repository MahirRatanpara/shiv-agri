import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
  isActive: boolean;
  category?: string;
  tags?: string[];
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  isActive: boolean;
  color?: string;
  icon?: string;
  priority?: number;
  userCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RoleCreateRequest {
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  metadata?: {
    color?: string;
    icon?: string;
    priority?: number;
  };
}

export interface RoleUpdateRequest {
  displayName?: string;
  description?: string;
  permissions?: string[];
  metadata?: {
    color?: string;
    icon?: string;
    priority?: number;
  };
  isActive?: boolean;
  force?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private apiUrl = environment.apiUrl;
  private userPermissionsSubject = new BehaviorSubject<string[]>([]);
  public userPermissions$ = this.userPermissionsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUserPermissions();
  }

  /**
   * Load user permissions from the current user data
   * Permissions come from the user's role
   */
  private loadUserPermissions(): void {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        // Permissions are stored in the roleRef
        if (user.roleRef?.permissions && Array.isArray(user.roleRef.permissions)) {
          const permissionNames = user.roleRef.permissions.map((p: any) =>
            typeof p === 'string' ? p : p.name
          );
          this.userPermissionsSubject.next(permissionNames);
        }
      } catch (error) {
        console.error('Error loading user permissions:', error);
      }
    }
  }

  /**
   * Update stored permissions (called after user login/refresh)
   */
  updateUserPermissions(permissions: Permission[] | string[]): void {
    const permissionNames = permissions.map((p: any) =>
      typeof p === 'string' ? p : p.name
    );
    this.userPermissionsSubject.next(permissionNames);
  }

  /**
   * Check if current user has a specific permission
   */
  hasPermission(permissionName: string): boolean {
    const currentUser = this.getCurrentUser();

    // Admin has all permissions
    if (currentUser?.role === 'admin') {
      return true;
    }

    const permissions = this.userPermissionsSubject.value;
    return permissions.includes(permissionName);
  }

  /**
   * Check if current user has all specified permissions
   */
  hasAllPermissions(permissionNames: string[]): boolean {
    return permissionNames.every(perm => this.hasPermission(perm));
  }

  /**
   * Check if current user has any of the specified permissions
   */
  hasAnyPermission(permissionNames: string[]): boolean {
    return permissionNames.some(perm => this.hasPermission(perm));
  }

  /**
   * Check if current user has a specific role
   */
  hasRole(roleName: string | string[]): boolean {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return false;

    if (Array.isArray(roleName)) {
      return roleName.includes(currentUser.role);
    }

    return currentUser.role === roleName;
  }

  /**
   * Get current user from storage
   */
  private getCurrentUser(): any {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  // ==================== API Methods ====================

  /**
   * Get all permissions
   */
  getAllPermissions(params?: {
    resource?: string;
    action?: string;
    category?: string;
    includeInactive?: boolean;
  }): Observable<{
    permissions: Permission[];
    groupedByResource: Record<string, Permission[]>;
    total: number;
  }> {
    return this.http.get<any>(`${this.apiUrl}/roles/permissions`, { params: params as any });
  }

  /**
   * Get all roles
   */
  getAllRoles(params?: {
    includeInactive?: boolean;
    includePermissions?: boolean;
  }): Observable<{ roles: Role[]; total: number }> {
    return this.http.get<any>(`${this.apiUrl}/roles`, { params: params as any });
  }

  /**
   * Get role by ID or name
   */
  getRole(id: string): Observable<{ role: Role }> {
    return this.http.get<any>(`${this.apiUrl}/roles/${id}`);
  }

  /**
   * Create new role
   */
  createRole(roleData: RoleCreateRequest): Observable<{
    message: string;
    role: Role;
  }> {
    return this.http.post<any>(`${this.apiUrl}/roles`, roleData);
  }

  /**
   * Update role
   */
  updateRole(id: string, roleData: RoleUpdateRequest): Observable<{
    message: string;
    role: Role;
    usersUpdated: number;
  }> {
    return this.http.put<any>(`${this.apiUrl}/roles/${id}`, roleData);
  }

  /**
   * Delete role
   */
  deleteRole(id: string): Observable<{
    message: string;
    deletedRole: string;
  }> {
    return this.http.delete<any>(`${this.apiUrl}/roles/${id}`);
  }

  /**
   * Assign role to user
   */
  assignRoleToUser(userId: string, roleName: string): Observable<{
    message: string;
    user: any;
    role: Role;
  }> {
    return this.http.post<any>(`${this.apiUrl}/roles/assign/${userId}`, { role: roleName });
  }

  /**
   * Clear permissions (on logout)
   */
  clearPermissions(): void {
    this.userPermissionsSubject.next([]);
  }
}
