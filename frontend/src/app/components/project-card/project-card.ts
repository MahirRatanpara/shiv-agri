import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Project } from '../../models/project.model';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './project-card.html',
  styleUrl: './project-card.css'
})
export class ProjectCardComponent {
  @Input() project!: Project;
  @Input() selected = false;
  @Input() selectable = false;

  @Output() favoriteToggle = new EventEmitter<string>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();

  get statusClass(): string {
    const map: Record<string, string> = {
      'Upcoming': 'status-upcoming',
      'Running': 'status-running',
      'Completed': 'status-completed',
      'On Hold': 'status-onhold',
      'Cancelled': 'status-cancelled'
    };
    return map[this.project.status] || '';
  }

  get categoryIcon(): string {
    const map: Record<string, string> = {
      'FARM': 'fas fa-tractor',
      'LANDSCAPING': 'fas fa-tree',
      'GARDENING': 'fas fa-seedling'
    };
    return map[this.project.category] || 'fas fa-project-diagram';
  }

  get budgetProgress(): number {
    return this.project.budgetUtilizationPercentage || 0;
  }

  get visitProgress(): number {
    return this.project.visitCompletionPercentage || 0;
  }

  get budgetProgressClass(): string {
    const pct = this.budgetProgress;
    if (pct >= 100) return 'progress-danger';
    if (pct >= 80) return 'progress-warning';
    return 'progress-normal';
  }

  get clientInitial(): string {
    return (this.project.clientName || this.project.name || '?')[0].toUpperCase();
  }

  get locationDisplay(): string {
    return this.project.fullLocation || [this.project.location?.city, this.project.location?.state].filter(Boolean).join(', ') || '';
  }

  get isFavorite(): boolean {
    return Array.isArray(this.project.isFavorite) && this.project.isFavorite.length > 0;
  }

  onFavoriteClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.favoriteToggle.emit(this.project._id);
  }

  onSelectionToggle(event: Event): void {
    event.stopPropagation();
    this.selected = !this.selected;
    this.selectionChange.emit({ id: this.project._id, selected: this.selected });
  }

  get Math() { return Math; }

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
