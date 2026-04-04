import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TransactionService } from '../../services/transaction.service';
import { TransactionSummary, CategoryBreakdown, MonthlyTrend } from '../../models/transaction.model';

@Component({
  selector: 'app-financial-charts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './financial-charts.html',
  styleUrl: './financial-charts.css'
})
export class FinancialChartsComponent implements OnInit, OnDestroy {
  @Input() projectId!: string;

  summary: TransactionSummary | null = null;
  categories: CategoryBreakdown[] = [];
  trends: MonthlyTrend[] = [];
  loading = true;

  private destroy$ = new Subject<void>();

  private currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });

  private categoryColors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb923c', '#fbbf24'];

  get Math() { return Math; }

  constructor(private transactionService: TransactionService) {}

  ngOnInit(): void {
    this.fetchData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchData(): void {
    this.loading = true;

    this.transactionService.getSummary(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.summary = data;
        this.checkLoading();
      });

    this.transactionService.getCategoryBreakdown(this.projectId, 'debit')
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.categories = data;
        this.checkLoading();
      });

    this.transactionService.getTrends(this.projectId, 6)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.trends = data;
        this.checkLoading();
      });
  }

  private checkLoading(): void {
    if (this.summary && this.categories && this.trends) {
      this.loading = false;
    }
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  getCategoryColor(index: number): string {
    return this.categoryColors[index % this.categoryColors.length];
  }

  getMaxTrendValue(): number {
    if (this.trends.length === 0) return 1;
    return Math.max(...this.trends.map(t => Math.max(t.totalDebit, t.totalCredit)), 1);
  }

  getBarHeight(value: number): number {
    return (value / this.getMaxTrendValue()) * 100;
  }

  getMonthLabel(trend: MonthlyTrend): string {
    const date = new Date(trend._id.year, trend._id.month - 1);
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }

  getBudgetPercentage(): number {
    if (!this.summary?.budgetUtilization) return 0;
    return Math.min(this.summary.budgetUtilization, 100);
  }

  getBudgetColor(): string {
    const pct = this.getBudgetPercentage();
    if (pct > 90) return '#ef4444';
    if (pct >= 75) return '#eab308';
    return '#10b981';
  }

  getBudgetGradient(): string {
    const pct = this.getBudgetPercentage();
    const color = this.getBudgetColor();
    return `conic-gradient(${color} ${pct * 3.6}deg, #e5e7eb ${pct * 3.6}deg)`;
  }
}
