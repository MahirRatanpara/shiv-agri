import {
  Directive,
  Input,
  OnInit,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';
import { PermissionService } from '../services/permission.service';

/**
 * Structural directive to show/hide elements based on user role
 *
 * Usage:
 * 1. Single role:
 *    <button *hasRole="'admin'">Admin Panel</button>
 *
 * 2. Multiple roles:
 *    <button *hasRole="['admin', 'manager']">Management Panel</button>
 *
 * 3. With else template:
 *    <div *hasRole="'admin'; else noAccess">
 *      Admin content
 *    </div>
 *    <ng-template #noAccess>
 *      <p>You don't have access to this</p>
 *    </ng-template>
 */
@Directive({
  selector: '[hasRole]',
  standalone: true
})
export class HasRoleDirective implements OnInit {
  private roles: string[] = [];
  private elseTemplateRef: TemplateRef<any> | null = null;
  private hasView = false;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService
  ) {}

  @Input()
  set hasRole(roles: string | string[]) {
    this.roles = Array.isArray(roles) ? roles : [roles];
    this.updateView();
  }

  @Input()
  set hasRoleElse(templateRef: TemplateRef<any> | null) {
    this.elseTemplateRef = templateRef;
    this.updateView();
  }

  ngOnInit(): void {
    this.updateView();
  }

  private updateView(): void {
    const hasRole = this.checkRoles();

    if (hasRole && !this.hasView) {
      // Show the main template
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasRole && this.hasView) {
      // Hide the main template
      this.viewContainer.clear();
      this.hasView = false;

      // Show the else template if provided
      if (this.elseTemplateRef) {
        this.viewContainer.createEmbeddedView(this.elseTemplateRef);
      }
    } else if (!hasRole && !this.hasView && this.elseTemplateRef) {
      // Initial render with no role - show else template
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.elseTemplateRef);
    }
  }

  private checkRoles(): boolean {
    if (this.roles.length === 0) {
      return true;
    }

    return this.permissionService.hasRole(this.roles);
  }
}
