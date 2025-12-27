import {
  Directive,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { PermissionService } from '../services/permission.service';

/**
 * Structural directive to show/hide elements based on user permissions
 *
 * Usage:
 * 1. Single permission:
 *    <button *hasPermission="'soil.sessions.create'">Create Session</button>
 *
 * 2. Multiple permissions (requires ALL):
 *    <button *hasPermission="['soil.sessions.create', 'soil.sessions.view']">
 *      Manage Sessions
 *    </button>
 *
 * 3. Multiple permissions (requires ANY):
 *    <button *hasPermission="['admin.view', 'manager.view']; mode: 'any'">
 *      View Dashboard
 *    </button>
 *
 * 4. With else template:
 *    <div *hasPermission="'admin.view'; else noAccess">
 *      Admin content
 *    </div>
 *    <ng-template #noAccess>
 *      <p>You don't have permission to view this</p>
 *    </ng-template>
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private permissions: string[] = [];
  private mode: 'all' | 'any' = 'all';
  private elseTemplateRef: TemplateRef<any> | null = null;
  private destroy$ = new Subject<void>();
  private hasView = false;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService
  ) {}

  @Input()
  set hasPermission(permissions: string | string[]) {
    this.permissions = Array.isArray(permissions) ? permissions : [permissions];
    this.updateView();
  }

  @Input()
  set hasPermissionMode(mode: 'all' | 'any') {
    this.mode = mode;
    this.updateView();
  }

  @Input()
  set hasPermissionElse(templateRef: TemplateRef<any> | null) {
    this.elseTemplateRef = templateRef;
    this.updateView();
  }

  ngOnInit(): void {
    // Subscribe to permission changes
    this.permissionService.userPermissions$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateView();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateView(): void {
    const hasPermission = this.checkPermissions();

    if (hasPermission && !this.hasView) {
      // Show the main template
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPermission && this.hasView) {
      // Hide the main template
      this.viewContainer.clear();
      this.hasView = false;

      // Show the else template if provided
      if (this.elseTemplateRef) {
        this.viewContainer.createEmbeddedView(this.elseTemplateRef);
      }
    } else if (!hasPermission && !this.hasView && this.elseTemplateRef) {
      // Initial render with no permission - show else template
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.elseTemplateRef);
    }
  }

  private checkPermissions(): boolean {
    if (this.permissions.length === 0) {
      return true;
    }

    if (this.mode === 'all') {
      return this.permissionService.hasAllPermissions(this.permissions);
    } else {
      return this.permissionService.hasAnyPermission(this.permissions);
    }
  }
}
