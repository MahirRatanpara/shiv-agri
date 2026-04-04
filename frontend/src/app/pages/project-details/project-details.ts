import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProjectService } from '../../services/project.service';
import { TransactionService } from '../../services/transaction.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { Project, ProjectContact } from '../../models/project.model';
import { Transaction } from '../../models/transaction.model';
import { ContactManagerComponent } from '../../components/contact-manager/contact-manager';
import { TransactionListComponent } from '../../components/transaction-list/transaction-list';
import { TransactionFormComponent } from '../../components/transaction-form/transaction-form';
import { VisitCalendarComponent } from '../../components/visit-calendar/visit-calendar';
import { VisitRecorderComponent } from '../../components/visit-recorder/visit-recorder';
import { VisitService } from '../../services/visit.service';
import { Visit } from '../../models/visit.model';
import { MediaGalleryComponent } from '../../components/media-gallery/media-gallery';
import { CommentThreadComponent } from '../../components/comment-thread/comment-thread';

type Tab = 'overview' | 'contacts' | 'transactions' | 'visits' | 'media' | 'comments';

@Component({
  selector: 'app-project-details',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    ContactManagerComponent, TransactionListComponent, TransactionFormComponent,
    VisitCalendarComponent, VisitRecorderComponent,
    MediaGalleryComponent, CommentThreadComponent
  ],
  templateUrl: './project-details.html',
  styleUrl: './project-details.css'
})
export class ProjectDetailsComponent implements OnInit, OnDestroy {
  project: Project | null = null;
  loading = true;
  activeTab: Tab = 'overview';
  projectId = '';

  // Transaction form modal
  showTransactionForm = false;
  editingTransaction: Transaction | null = null;

  // Visit recorder
  showVisitRecorder = false;
  selectedVisit: Visit | null = null;


  tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'fas fa-th-large' },
    { key: 'contacts', label: 'Contacts', icon: 'fas fa-address-book' },
    { key: 'transactions', label: 'Transactions', icon: 'fas fa-exchange-alt' },
    { key: 'visits', label: 'Visits', icon: 'fas fa-calendar-check' },
    { key: 'media', label: 'Media', icon: 'fas fa-images' },
    { key: 'comments', label: 'Comments', icon: 'fas fa-comments' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private projectService: ProjectService,
    private transactionService: TransactionService,
    private visitService: VisitService,
    private toast: ToastService,
    private confirmService: ConfirmationModalService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.projectId) {
      this.router.navigate(['/farm-dashboard']);
      return;
    }
    this.loadProject();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProject(): void {
    this.loading = true;
    this.projectService.getProject(this.projectId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (project) => {
        this.project = project;
        this.loading = false;
      },
      error: () => {
        this.toast.error('Failed to load project');
        this.router.navigate(['/farm-dashboard']);
      }
    });
  }

  // ─── Navigation ───

  switchTab(tab: Tab): void {
    this.activeTab = tab;
  }

  goBack(): void {
    this.router.navigate(['/farm-dashboard']);
  }

  editProject(): void {
    this.router.navigate(['/projects/edit', this.projectId]);
  }

  async deleteProject(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project? This action cannot be undone.'
    });
    if (!confirmed) return;

    this.projectService.deleteProject(this.projectId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Project deleted');
        this.router.navigate(['/farm-dashboard']);
      },
      error: () => this.toast.error('Failed to delete project')
    });
  }

  toggleFavorite(): void {
    if (!this.project) return;
    this.projectService.toggleFavorite(this.projectId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        if (this.project) {
          // Toggle local state
          const userId = res?.data?.userId;
          if (userId) {
            const idx = this.project.isFavorite.indexOf(userId);
            if (idx >= 0) this.project.isFavorite.splice(idx, 1);
            else this.project.isFavorite.push(userId);
          }
        }
      }
    });
  }

  // ─── Transactions ───

  openAddTransaction(): void {
    this.editingTransaction = null;
    this.showTransactionForm = true;
  }

  openEditTransaction(transaction: Transaction): void {
    this.editingTransaction = transaction;
    this.showTransactionForm = true;
  }

  async onDeleteTransaction(transaction: Transaction): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Delete Transaction',
      message: `Delete "${transaction.description}" (${this.formatCurrency(transaction.amount)})?`
    });
    if (!confirmed) return;

    this.transactionService.deleteTransaction(transaction._id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Transaction deleted');
        this.loadProject(); // Refresh budget numbers
      },
      error: () => this.toast.error('Failed to delete transaction')
    });
  }

  onTransactionSaved(): void {
    this.showTransactionForm = false;
    this.editingTransaction = null;
    this.loadProject();
  }

  // ─── Contacts ───

  onContactsChange(contacts: ProjectContact[]): void {
    if (!this.project) return;
    this.projectService.updateProject(this.projectId, { contacts }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.project) this.project.contacts = contacts;
      },
      error: () => this.toast.error('Failed to update contacts')
    });
  }

  // ─── Visits ───

  onVisitClick(visit: Visit): void {
    this.selectedVisit = visit;
    if (visit.status === 'scheduled' || visit.status === 'in_progress') {
      this.showVisitRecorder = true;
    }
  }

  onScheduleVisit(): void {
    // Navigate to create a new visit via the calendar's dateClick
    this.activeTab = 'visits';
  }

  onDateClick(dateStr: string): void {
    const visit: Partial<Visit> = { projectId: this.projectId, scheduledDate: dateStr, type: 'routine' };
    this.visitService.createVisit(visit as any).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Visit scheduled');
        this.loadProject();
      },
      error: () => this.toast.error('Failed to schedule visit')
    });
  }

  onVisitCompleted(): void {
    this.showVisitRecorder = false;
    this.selectedVisit = null;
    this.loadProject();
  }

  // ─── Helpers ───

  get activeContactCount(): number {
    return this.project?.contacts?.filter(c => c.isActive)?.length || 0;
  }

  get statusClass(): string {
    if (!this.project) return '';
    const map: Record<string, string> = {
      'Running': 'status-running', 'Completed': 'status-completed',
      'Upcoming': 'status-upcoming', 'On Hold': 'status-hold', 'Cancelled': 'status-cancelled'
    };
    return map[this.project.status] || '';
  }

  get budgetPercent(): number {
    if (!this.project || !this.project.budget) return 0;
    return Math.min(Math.round((this.project.expenses / this.project.budget) * 100), 100);
  }

  get visitPercent(): number {
    if (!this.project || !this.project.totalVisitsPlanned) return 0;
    return Math.min(Math.round((this.project.totalVisitsCompleted / this.project.totalVisitsPlanned) * 100), 100);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
  }

  formatDate(date: string | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  get Math() { return Math; }
}
