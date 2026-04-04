import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Project, ProjectFilters, ProjectSortOptions, Pagination, ViewMode, SortField } from '../../models/project.model';
import { ProjectCardComponent } from '../project-card/project-card';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ProjectCardComponent],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css'
})
export class ProjectListComponent implements OnInit, OnDestroy {
  @Input() projects: Project[] = [];
  @Input() pagination: Pagination | null = null;
  @Input() loading = false;
  @Input() viewMode: ViewMode = 'grid';

  @Output() pageChange = new EventEmitter<number>();
  @Output() favoriteToggle = new EventEmitter<string>();
  @Output() viewModeChange = new EventEmitter<ViewMode>();
  @Output() sortChange = new EventEmitter<ProjectSortOptions>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() bulkAction = new EventEmitter<{ action: string; ids: string[] }>();

  searchTerm = '';
  selectedIds = new Set<string>();
  selectAll = false;

  currentSort: SortField = 'updatedAt';
  currentSortOrder: 'asc' | 'desc' = 'desc';

  sortOptions: { value: SortField; label: string }[] = [
    { value: 'updatedAt', label: 'Recently Updated' },
    { value: 'createdAt', label: 'Recently Created' },
    { value: 'name', label: 'Name A-Z' },
    { value: 'budget', label: 'Budget High-Low' },
    { value: 'status', label: 'Status' }
  ];

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Restore view preference
    const saved = localStorage.getItem('projectViewMode');
    if (saved === 'grid' || saved === 'list') {
      this.viewMode = saved;
    }

    // Debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(term => {
      this.searchChange.emit(term);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchTerm);
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.searchSubject.next('');
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    localStorage.setItem('projectViewMode', mode);
    this.viewModeChange.emit(mode);
  }

  onSortChange(): void {
    const sortOrder: 'asc' | 'desc' = this.currentSort === 'name' ? 'asc' : 'desc';
    this.currentSortOrder = sortOrder;
    this.sortChange.emit({ sortBy: this.currentSort, sortOrder });
  }

  onFavoriteToggle(projectId: string): void {
    this.favoriteToggle.emit(projectId);
  }

  // ─── Selection ───

  toggleSelectAll(): void {
    this.selectAll = !this.selectAll;
    if (this.selectAll) {
      this.projects.forEach(p => this.selectedIds.add(p._id));
    } else {
      this.selectedIds.clear();
    }
  }

  onSelectionChange(event: { id: string; selected: boolean }): void {
    if (event.selected) {
      this.selectedIds.add(event.id);
    } else {
      this.selectedIds.delete(event.id);
    }
    this.selectAll = this.selectedIds.size === this.projects.length;
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.selectAll = false;
  }

  onBulkAction(action: string): void {
    if (this.selectedIds.size === 0) return;
    this.bulkAction.emit({ action, ids: Array.from(this.selectedIds) });
    this.clearSelection();
  }

  // ─── Pagination ───

  goToPage(page: number): void {
    if (page < 1 || (this.pagination && page > this.pagination.totalPages)) return;
    this.pageChange.emit(page);
  }

  get pageNumbers(): number[] {
    if (!this.pagination) return [];
    const total = this.pagination.totalPages;
    const current = this.pagination.page;
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  get Math() { return Math; }

  trackById(index: number, project: Project): string {
    return project._id;
  }

  formatCurrency(value: number): string {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value}`;
  }

  timeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
}
