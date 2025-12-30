import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { PermissionService } from '../../services/permission.service';

@Component({
  selector: 'app-managerial-work',
  standalone: true,
  imports: [CommonModule, RouterModule, HasPermissionDirective],
  templateUrl: './managerial-work.html',
  styleUrls: ['./managerial-work.css'],
})
export class ManagerialWorkComponent implements OnInit {
  activeTab: 'receipts' | 'invoices' | 'letters' = 'receipts';

  constructor(
    private router: Router,
    private permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    // Determine active tab from current route
    const currentPath = this.router.url;
    if (currentPath.includes('/invoices')) {
      this.activeTab = 'invoices';
    } else if (currentPath.includes('/letters')) {
      this.activeTab = 'letters';
    } else {
      this.activeTab = 'receipts';
    }
  }

  setActiveTab(tab: 'receipts' | 'invoices' | 'letters'): void {
    this.activeTab = tab;
    this.router.navigate(['/managerial-work', tab]);
  }

  hasPermission(permission: string): boolean {
    return this.permissionService.hasPermission(permission);
  }
}
