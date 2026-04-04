import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectFilters, ProjectCategory, ProjectStatus } from '../../models/project.model';

@Component({
  selector: 'app-project-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-filters.html',
  styleUrl: './project-filters.css'
})
export class ProjectFiltersComponent {
  @Input() filters: ProjectFilters = {};
  @Input() isOpen = false;

  @Output() filtersChange = new EventEmitter<ProjectFilters>();
  @Output() close = new EventEmitter<void>();

  categories: { value: ProjectCategory; label: string; icon: string }[] = [
    { value: 'FARM', label: 'Farm', icon: 'fas fa-tractor' },
    { value: 'LANDSCAPING', label: 'Landscaping', icon: 'fas fa-tree' },
    { value: 'GARDENING', label: 'Gardening', icon: 'fas fa-seedling' }
  ];

  statuses: { value: ProjectStatus; label: string }[] = [
    { value: 'Upcoming', label: 'Upcoming' },
    { value: 'Running', label: 'Running' },
    { value: 'Completed', label: 'Completed' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  // Local filter state
  selectedCategories: ProjectCategory[] = [];
  selectedStatuses: ProjectStatus[] = [];
  city = '';
  budgetMin: number | null = null;
  budgetMax: number | null = null;
  favoritesOnly = false;

  ngOnChanges(): void {
    if (this.filters) {
      this.selectedCategories = this.filters.categoryInclude || [];
      this.selectedStatuses = Array.isArray(this.filters.status) ? this.filters.status : this.filters.status ? [this.filters.status] : [];
      this.city = this.filters.city || '';
      this.budgetMin = this.filters.budgetMin || null;
      this.budgetMax = this.filters.budgetMax || null;
      this.favoritesOnly = this.filters.isFavorite || false;
    }
  }

  toggleCategory(cat: ProjectCategory): void {
    const idx = this.selectedCategories.indexOf(cat);
    if (idx >= 0) {
      this.selectedCategories.splice(idx, 1);
    } else {
      this.selectedCategories.push(cat);
    }
    this.emitFilters();
  }

  isCategorySelected(cat: ProjectCategory): boolean {
    return this.selectedCategories.includes(cat);
  }

  toggleStatus(status: ProjectStatus): void {
    const idx = this.selectedStatuses.indexOf(status);
    if (idx >= 0) {
      this.selectedStatuses.splice(idx, 1);
    } else {
      this.selectedStatuses.push(status);
    }
    this.emitFilters();
  }

  isStatusSelected(status: ProjectStatus): boolean {
    return this.selectedStatuses.includes(status);
  }

  onCityChange(): void {
    this.emitFilters();
  }

  onBudgetChange(): void {
    this.emitFilters();
  }

  toggleFavorites(): void {
    this.favoritesOnly = !this.favoritesOnly;
    this.emitFilters();
  }

  clearAll(): void {
    this.selectedCategories = [];
    this.selectedStatuses = [];
    this.city = '';
    this.budgetMin = null;
    this.budgetMax = null;
    this.favoritesOnly = false;
    this.emitFilters();
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.selectedCategories.length) count++;
    if (this.selectedStatuses.length) count++;
    if (this.city) count++;
    if (this.budgetMin || this.budgetMax) count++;
    if (this.favoritesOnly) count++;
    return count;
  }

  private emitFilters(): void {
    const filters: ProjectFilters = {};
    if (this.selectedCategories.length) filters.categoryInclude = [...this.selectedCategories];
    if (this.selectedStatuses.length) filters.status = [...this.selectedStatuses];
    if (this.city) filters.city = this.city;
    if (this.budgetMin) filters.budgetMin = this.budgetMin;
    if (this.budgetMax) filters.budgetMax = this.budgetMax;
    if (this.favoritesOnly) filters.isFavorite = true;
    this.filtersChange.emit(filters);
  }

  onClose(): void {
    this.close.emit();
  }
}
