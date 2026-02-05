import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { PermissionService } from '../../services/permission.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-lab-testing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './lab-testing.html',
  styleUrls: ['./lab-testing.css']
})
export class LabTestingComponent implements OnInit {
  activeSubModule: string = 'soil-testing';

  // Permission flags
  hasSoilTestingAccess = false;
  hasWaterTestingAccess = false;
  hasFertilizerTestingAccess = false;

  constructor(
    private router: Router,
    private permissionService: PermissionService
  ) {}

  ngOnInit() {
    // Check permissions
    this.checkPermissions();

    // Set active sub-module based on current route
    this.setActiveSubModuleFromRoute(this.router.url);

    // Listen to route changes to update active sub-module
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.setActiveSubModuleFromRoute(event.url);
      });

    // Redirect to first available sub-module if on parent route
    if (this.router.url === '/lab-testing' || this.router.url === '/lab-testing/') {
      this.redirectToFirstAvailableModule();
    }
  }

  checkPermissions() {
    // Check Soil Testing permissions
    this.hasSoilTestingAccess = this.permissionService.hasAnyPermission([
      'soil.sessions.view',
      'soil.sessions.create',
      'soil.sessions.update',
      'soil.samples.view',
      'soil.samples.create',
      'soil.reports.download'
    ]);

    // Check Water Testing permissions
    this.hasWaterTestingAccess = this.permissionService.hasAnyPermission([
      'water.sessions.view',
      'water.sessions.create',
      'water.sessions.update',
      'water.samples.view',
      'water.samples.create',
      'water.reports.download'
    ]);

    // Check Fertilizer Testing permissions
    this.hasFertilizerTestingAccess = this.permissionService.hasAnyPermission([
      'soil.sessions.view',
      'soil.sessions.create',
      'soil.sessions.update',
      'soil.samples.view',
      'soil.samples.create'
    ]);
  }

  setActiveSubModuleFromRoute(url: string) {
    if (url.includes('/lab-testing/soil-testing')) {
      this.activeSubModule = 'soil-testing';
    } else if (url.includes('/lab-testing/fertilizer-testing')) {
      this.activeSubModule = 'fertilizer-testing';
    } else if (url.includes('/lab-testing/water-testing')) {
      this.activeSubModule = 'water-testing';
    }
  }

  redirectToFirstAvailableModule() {
    if (this.hasSoilTestingAccess) {
      this.router.navigate(['/lab-testing/soil-testing']);
    } else if (this.hasFertilizerTestingAccess) {
      this.router.navigate(['/lab-testing/fertilizer-testing']);
    } else if (this.hasWaterTestingAccess) {
      this.router.navigate(['/lab-testing/water-testing']);
    }
  }

  navigateToSubModule(module: string) {
    this.activeSubModule = module;
    this.router.navigate([`/lab-testing/${module}`]);
  }

  isActive(module: string): boolean {
    return this.activeSubModule === module;
  }
}
