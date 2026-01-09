import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

interface Transaction {
  _id: string; // Changed from expenseId to _id (separate document)
  projectId: string; // Reference to project
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category?: string;
  date: Date;
  notes?: string;
  createdBy?: any;
  createdAt: Date;
  updatedAt?: Date;
}

interface TransactionSummary {
  totalCredits: number;
  totalDebits: number;
  netExpense: number;
  budget: number;
  budgetRemaining: number;
  budgetUtilization: number;
  transactionCount: number;
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

  // Transactions
  expenseEntries?: Transaction[];

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
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  templateUrl: './project-details.html',
  styleUrls: ['./project-details.css', './project-details-transactions.css'],
})
export class ProjectDetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  project: ProjectDetails | null = null;
  isLoading = true;
  projectId: string = '';

  // View state
  activeTab: 'overview' | 'team' | 'timeline' | 'activity' | 'transactions' = 'overview';
  showAllImages = false;

  // Transaction state
  transactions: Transaction[] = [];
  transactionSummary: TransactionSummary | null = null;
  transactionPage = 1;
  transactionLimit = 20;
  transactionPagination: any = null;
  isLoadingTransactions = false;

  // Transaction form state
  showTransactionModal = false;
  transactionForm: {
    _id?: string; // Changed from expenseId to _id
    description: string;
    amount: number | null;
    type: 'debit' | 'credit';
    category: string;
    date: string;
    notes: string;
  } = {
    description: '',
    amount: null,
    type: 'debit',
    category: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  };
  isEditMode = false;
  isSavingTransaction = false;

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

  // Transaction/Budget calculations
  getTotalDebits(): number {
    // Use transactionSummary if available, otherwise calculate from project
    if (this.transactionSummary) {
      return this.transactionSummary.totalDebits;
    }
    if (!this.project?.expenseEntries) return 0;
    return this.project.expenseEntries
      .filter(e => e.type === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  getTotalCredits(): number {
    // Use transactionSummary if available, otherwise calculate from project
    if (this.transactionSummary) {
      return this.transactionSummary.totalCredits;
    }
    if (!this.project?.expenseEntries) return 0;
    return this.project.expenseEntries
      .filter(e => e.type === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  getNetExpenses(): number {
    if (this.transactionSummary) {
      return this.transactionSummary.netExpense;
    }
    return this.getTotalDebits() - this.getTotalCredits();
  }

  getRemainingBudget(): number {
    if (this.transactionSummary) {
      return this.transactionSummary.budgetRemaining;
    }
    if (!this.project) return 0;
    return this.project.budget - this.getNetExpenses();
  }

  getBudgetUtilization(): number {
    if (this.transactionSummary && this.transactionSummary.budget > 0) {
      return this.transactionSummary.budgetUtilization;
    }
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
  setActiveTab(tab: 'overview' | 'team' | 'timeline' | 'activity' | 'transactions'): void {
    this.activeTab = tab;
    // Load transactions when switching to transactions tab
    if (tab === 'transactions' && this.transactions.length === 0) {
      this.loadTransactions();
    }
  }

  // Image gallery
  toggleImageGallery(): void {
    this.showAllImages = !this.showAllImages;
  }

  // ========================
  // Transaction Management
  // ========================

  loadTransactions(page: number = 1): void {
    if (!this.projectId) return;

    this.isLoadingTransactions = true;
    this.transactionPage = page;

    this.dashboardService.getProjectTransactions(this.projectId, page, this.transactionLimit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.transactions = response.transactions || [];
            this.transactionPagination = response.pagination;
            this.transactionSummary = response.summary;
          }
          this.isLoadingTransactions = false;
        },
        error: (err) => {
          console.error('Error loading transactions:', err);
          this.toastService.error('Failed to load transactions');
          this.isLoadingTransactions = false;
        }
      });
  }

  openAddTransactionModal(): void {
    this.isEditMode = false;
    this.transactionForm = {
      description: '',
      amount: null,
      type: 'debit',
      category: '',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };
    this.showTransactionModal = true;
  }

  openEditTransactionModal(transaction: Transaction): void {
    this.isEditMode = true;
    this.transactionForm = {
      _id: transaction._id, // Changed from expenseId to _id
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category || '',
      date: new Date(transaction.date).toISOString().split('T')[0],
      notes: transaction.notes || ''
    };
    this.showTransactionModal = true;
  }

  closeTransactionModal(): void {
    this.showTransactionModal = false;
    this.transactionForm = {
      description: '',
      amount: null,
      type: 'debit',
      category: '',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };
    this.isEditMode = false;
  }

  saveTransaction(): void {
    if (!this.projectId || !this.transactionForm.description || !this.transactionForm.amount) {
      this.toastService.error('Please fill in all required fields');
      return;
    }

    this.isSavingTransaction = true;

    const transactionData = {
      description: this.transactionForm.description,
      amount: this.transactionForm.amount,
      type: this.transactionForm.type,
      category: this.transactionForm.category || undefined,
      date: this.transactionForm.date ? new Date(this.transactionForm.date) : new Date(),
      notes: this.transactionForm.notes || undefined
    };

    const operation = this.isEditMode && this.transactionForm._id
      ? this.dashboardService.updateTransaction(this.projectId, this.transactionForm._id, transactionData) // Changed from expenseId to _id
      : this.dashboardService.addTransaction(this.projectId, transactionData);

    operation.pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.toastService.success(
              this.isEditMode ? 'Transaction updated successfully' : 'Transaction added successfully'
            );
            this.closeTransactionModal();
            this.loadTransactions(this.transactionPage); // Reload current page
            this.loadProject(); // Reload project to update budget summary
          }
          this.isSavingTransaction = false;
        },
        error: (err) => {
          console.error('Error saving transaction:', err);
          this.toastService.error('Failed to save transaction');
          this.isSavingTransaction = false;
        }
      });
  }

  deleteTransaction(transaction: Transaction): void {
    if (!this.projectId || !transaction._id) return; // Changed from expenseId to _id

    if (confirm(`Are you sure you want to delete this transaction?`)) {
      this.dashboardService.deleteTransaction(this.projectId, transaction._id) // Changed from expenseId to _id
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.toastService.success('Transaction deleted successfully');
              this.loadTransactions(this.transactionPage);
              this.loadProject(); // Reload project to update budget summary
            }
          },
          error: (err) => {
            console.error('Error deleting transaction:', err);
            this.toastService.error('Failed to delete transaction');
          }
        });
    }
  }

  nextTransactionPage(): void {
    if (this.transactionPagination && this.transactionPagination.hasNext) {
      this.loadTransactions(this.transactionPage + 1);
    }
  }

  prevTransactionPage(): void {
    if (this.transactionPagination && this.transactionPagination.hasPrev) {
      this.loadTransactions(this.transactionPage - 1);
    }
  }

  goToTransactionPage(page: number): void {
    this.loadTransactions(page);
  }

  getTransactionTypeLabel(type: string): string {
    return type === 'debit' ? 'Expense' : 'Income';
  }

  getTransactionTypeClass(type: string): string {
    return type === 'debit' ? 'transaction-debit' : 'transaction-credit';
  }
}
