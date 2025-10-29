import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LandscapingService } from '../../services/landscaping.service';
import {
  Project,
  ProjectFilter,
  ProjectStatus,
  ProjectListResponse
} from '../../models/landscaping.model';

@Component({
  selector: 'app-landscaping-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landscaping-dashboard.component.html',
  styleUrls: ['./landscaping-dashboard.component.css']
})
export class LandscapingDashboardComponent implements OnInit {
  projects: Project[] = [];
  filteredProjects: Project[] = [];
  loading = false;
  error: string | null = null;

  // Filter properties
  filters: ProjectFilter = {
    searchTerm: '',
    status: undefined,
    city: undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    limit: 10
  };

  // Pagination
  currentPage = 1;
  totalPages = 1;
  totalProjects = 0;

  // Statistics
  stats = {
    total: 0,
    completed: 0,
    running: 0,
    upcoming: 0
  };

  // Dropdown options
  projectStatuses = Object.values(ProjectStatus);
  cities: string[] = [];
  sortOptions = [
    { value: 'projectName', label: 'Project Name' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'status', label: 'Status' },
    { value: 'startDate', label: 'Start Date' }
  ];

  // View mode
  viewMode: 'grid' | 'list' = 'grid';

  constructor(
    private landscapingService: LandscapingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadProjects();
    this.loadCities();
    this.loadStats();
  }

  loadProjects(): void {
    this.loading = true;
    this.error = null;

    this.landscapingService.getProjects(this.filters).subscribe({
      next: (response: ProjectListResponse) => {
        this.projects = response.projects;
        this.filteredProjects = response.projects;
        this.totalProjects = response.total;
        this.currentPage = response.page;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load projects. Please try again.';
        console.error('Error loading projects:', err);
        this.loading = false;
      }
    });
  }

  loadCities(): void {
    this.landscapingService.getCities().subscribe({
      next: (cities) => {
        this.cities = cities;
      },
      error: (err) => {
        console.error('Error loading cities:', err);
      }
    });
  }

  loadStats(): void {
    this.landscapingService.getProjectStats().subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (err) => {
        console.error('Error loading stats:', err);
      }
    });
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadProjects();
  }

  clearFilters(): void {
    this.filters = {
      searchTerm: '',
      status: undefined,
      city: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      limit: 10
    };
    this.loadProjects();
  }

  onSearch(): void {
    this.applyFilters();
  }

  onStatusChange(status: string): void {
    this.filters.status = status as ProjectStatus || undefined;
    this.applyFilters();
  }

  onCityChange(city: string): void {
    this.filters.city = city || undefined;
    this.applyFilters();
  }

  onSortChange(): void {
    this.applyFilters();
  }

  toggleSortOrder(): void {
    this.filters.sortOrder = this.filters.sortOrder === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.filters.page = page;
      this.loadProjects();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  viewProject(projectId: string): void {
    this.router.navigate(['/landscaping/project', projectId]);
  }

  editProject(projectId: string): void {
    this.router.navigate(['/landscaping/project', projectId, 'edit']);
  }

  createNewProject(): void {
    this.router.navigate(['/landscaping/project/new']);
  }

  deleteProject(projectId: string, projectName: string): void {
    if (confirm(`Are you sure you want to delete the project "${projectName}"?`)) {
      this.landscapingService.deleteProject(projectId).subscribe({
        next: () => {
          this.loadProjects();
          this.loadStats();
          alert('Project deleted successfully');
        },
        error: (err) => {
          console.error('Error deleting project:', err);
          alert('Failed to delete project. Please try again.');
        }
      });
    }
  }

  getStatusClass(status: ProjectStatus): string {
    switch (status) {
      case ProjectStatus.COMPLETED:
        return 'badge-success';
      case ProjectStatus.RUNNING:
        return 'badge-primary';
      case ProjectStatus.UPCOMING:
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getPaginationPages(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  // Helper method to get primary owner contact name
  getOwnerName(project: Project): string {
    const owner = project.contacts?.find(c => c.role === 'OWNER');
    return owner?.name || 'N/A';
  }

  // Expose Math to template
  Math = Math;
}
