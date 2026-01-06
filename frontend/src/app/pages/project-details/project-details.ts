import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardService } from '../../services/dashboard.service';
import { ToastService } from '../../services/toast.service';
import {HasPermissionDirective} from '../../directives/has-permission.directive';

interface Location {
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  coordinates?: {
    type: string;
    coordinates: [number, number]; // [longitude, latitude]
  };
  mapUrl?: string;
}

interface Contact {
  contactId: string;
  fullName: string;
  designation?: string;
  phone: string;
  email?: string;
  role?: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface Milestone {
  milestoneId: string;
  name: string;
  date: Date;
  description?: string;
  isCompleted: boolean;
  completedAt?: Date;
}

interface Crop {
  name: string;
  variety?: string;
  season?: string;
  plantingDate?: Date;
  expectedHarvestDate?: Date;
  area?: number;
}

interface LandDetails {
  totalArea?: number;
  areaUnit?: string;
  cultivableArea?: number;
  cultivablePercentage?: number;
  soilType?: string;
  waterSource?: string[];
  irrigationSystem?: string;
  terrainType?: string;
}

interface ProjectImage {
  url: string;
  caption?: string;
  uploadedAt: Date;
}

interface ExpenseEntry {
  expenseId: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  category?: string;
  date: Date;
  notes?: string;
  createdAt: Date;
}

interface ProjectDetails {
  _id: string;
  id: string;
  name: string;
  category: string;
  status: string;

  // Client info
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAvatar?: string;
  alternativeContact?: string;

  // Location
  location?: Location;

  // Budget
  budget: number;
  expenses: number;
  budgetUtilizationPercentage: number;
  budgetCategories?: Array<{ category: string; percentage: number; amount: number }>;

  // Dates
  startDate?: Date;
  completionDate?: Date;
  expectedCompletionDate?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Team
  assignedToName?: string;
  assignedTeam?: Array<{ _id: string; name: string }>;
  projectManager?: { _id: string; name: string };
  fieldWorkers?: Array<{ _id: string; name: string }>;
  consultants?: Array<{ _id: string; name: string }>;

  // Project specifics
  size?: { value: number; unit: string };
  landDetails?: LandDetails;
  crops?: Crop[];
  soilType?: string;
  irrigationType?: string;
  description?: string;
  notes?: string;

  // Progress
  visitCompletionPercentage: number;
  totalVisitsPlanned: number;
  totalVisitsCompleted: number;
  numberOfVisits?: number;
  numberOfYears?: number;
  visitFrequency?: number;

  // Expenses
  expenseEntries?: ExpenseEntry[];

  // Media
  coverImage?: string;
  thumbnailUrl?: string;
  images?: ProjectImage[];

  // Contacts & milestones
  contacts?: Contact[];
  milestones?: Milestone[];

  // Metadata
  tags?: string[];
  priority?: string;
  isFavorite?: string[];
}

@Component({
  selector: 'app-project-details',
  standalone: true,
  imports: [CommonModule, HasPermissionDirective],
  templateUrl: './project-details.html',
  styleUrl: './project-details.css',
})
export class ProjectDetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  project: ProjectDetails | null = null;
  isLoading = true;
  projectId: string = '';

  // View state
  activeTab: 'overview' | 'team' | 'timeline' | 'activity' = 'overview';
  showAllImages = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dashboardService: DashboardService,
    private toastService: ToastService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.projectId = params['id'];
      if (this.projectId) {
        this.loadProject();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProject(): void {
    this.isLoading = true;
    this.dashboardService.getProjectDetails(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.project = {
              ...response.data,
              id: response.data._id || response.data.id
            };
          } else {
            this.project = null;
            this.toastService.error('Project not found');
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading project:', err);
          this.project = null;
          this.isLoading = false;
          this.toastService.error('Failed to load project details');
        }
      });
  }

  // Utility methods
  getMapEmbedUrl(): SafeResourceUrl {
    if (!this.project?.location?.coordinates?.coordinates) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('');
    }

    const [lng, lat] = this.project.location.coordinates.coordinates;
    // Using Google Maps Embed API (completely free, no API key needed)
    // Parameters: q= location, z= zoom level, output=embed for iframe
    const url = `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d1000!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sin`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  getDirectionsUrl(): string {
    if (!this.project?.location?.coordinates?.coordinates) return '#';

    const [lng, lat] = this.project.location.coordinates.coordinates;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateTime(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'Upcoming': '#2196F3',
      'Running': '#4CAF50',
      'Completed': '#7B1FA2',
      'On Hold': '#FF9800',
      'Cancelled': '#F44336'
    };
    return colors[status] || '#666';
  }

  getPriorityColor(priority?: string): string {
    const colors: { [key: string]: string } = {
      'low': '#4CAF50',
      'medium': '#2196F3',
      'high': '#FF9800',
      'urgent': '#F44336'
    };
    return colors[priority || 'medium'] || '#666';
  }

  getBudgetHealthColor(): string {
    if (!this.project) return '#4CAF50';
    const utilization = this.project.budgetUtilizationPercentage;
    if (utilization <= 75) return '#4CAF50';
    if (utilization <= 90) return '#FF9800';
    return '#F44336';
  }

  getVisibleImages(): ProjectImage[] {
    if (!this.project?.images) return [];
    return this.showAllImages ? this.project.images : this.project.images.slice(0, 6);
  }

  getPrimaryContact(): Contact | undefined {
    return this.project?.contacts?.find(c => c.isPrimary && c.isActive);
  }

  getActiveContacts(): Contact[] {
    return this.project?.contacts?.filter(c => c.isActive) || [];
  }

  getUpcomingMilestones(): Milestone[] {
    return this.project?.milestones?.filter(m => !m.isCompleted) || [];
  }

  getCompletedMilestones(): Milestone[] {
    return this.project?.milestones?.filter(m => m.isCompleted) || [];
  }

  // Expense calculations
  getTotalExpenses(): number {
    if (!this.project?.expenseEntries) return 0;
    return this.project.expenseEntries
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  getTotalIncome(): number {
    if (!this.project?.expenseEntries) return 0;
    return this.project.expenseEntries
      .filter(e => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  getNetExpenses(): number {
    return this.getTotalExpenses() - this.getTotalIncome();
  }

  getRemainingBudget(): number {
    if (!this.project) return 0;
    return this.project.budget - this.getNetExpenses();
  }

  getBudgetUtilization(): number {
    if (!this.project || this.project.budget === 0) return 0;
    return Math.min(100, Math.round((this.getNetExpenses() / this.project.budget) * 100));
  }

  // Timeline calculations
  getVisitsPerYear(): number {
    return this.project?.visitFrequency || 0;
  }

  getTotalProjectVisits(): number {
    if (!this.project) return 0;
    if (this.project.numberOfVisits) return this.project.numberOfVisits;
    // Calculate from years * visits per year
    return (this.project.numberOfYears || 0) * (this.project.visitFrequency || 0);
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/farm-dashboard']);
  }

  editProject(): void {
    if (this.project) {
      // Navigate to edit route
      this.router.navigate(['/projects/edit', this.projectId]);
    }
  }

  deleteProject(): void {
    if (!this.project) return;

    if (confirm(`Are you sure you want to delete "${this.project.name}"?`)) {
      this.dashboardService.deleteProject(this.projectId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.toastService.success('Project deleted successfully');
            this.router.navigate(['/farm-dashboard']);
          },
          error: (err) => {
            console.error('Error deleting project:', err);
            this.toastService.error('Failed to delete project');
          }
        });
    }
  }

  openLocation(): void {
    if (this.project?.location?.mapUrl) {
      window.open(this.project.location.mapUrl, '_blank');
    } else if (this.project?.location?.coordinates?.coordinates) {
      const [lng, lat] = this.project.location.coordinates.coordinates;
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    }
  }

  // Tab navigation
  setActiveTab(tab: 'overview' | 'team' | 'timeline' | 'activity'): void {
    this.activeTab = tab;
  }

  // Image gallery
  toggleImageGallery(): void {
    this.showAllImages = !this.showAllImages;
  }
}
