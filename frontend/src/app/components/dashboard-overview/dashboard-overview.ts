import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStats } from '../../models/project.model';

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-overview.html',
  styleUrl: './dashboard-overview.css'
})
export class DashboardOverviewComponent {
  @Input() stats: DashboardStats | null = null;
  @Input() loading = false;

  get statCards(): { label: string; value: string | number; icon: string; color: string; subLabel?: string }[] {
    if (!this.stats) return [];
    return [
      {
        label: 'Total Projects',
        value: this.stats.totalProjects,
        icon: 'fas fa-folder-open',
        color: 'var(--stat-purple)',
        subLabel: `${this.stats.activeProjects} active`
      },
      {
        label: 'Total Budget',
        value: this.formatCurrency(this.stats.totalBudget),
        icon: 'fas fa-wallet',
        color: 'var(--stat-blue)',
        subLabel: `${this.formatCurrency(this.stats.totalExpenses)} spent`
      },
      {
        label: 'Active',
        value: this.stats.activeProjects,
        icon: 'fas fa-play-circle',
        color: 'var(--stat-green)',
        subLabel: 'Running + Upcoming'
      },
      {
        label: 'Completed',
        value: this.stats.completedProjects,
        icon: 'fas fa-check-circle',
        color: 'var(--stat-emerald)',
        subLabel: `of ${this.stats.totalProjects}`
      }
    ];
  }

  formatCurrency(value: number): string {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value}`;
  }
}
