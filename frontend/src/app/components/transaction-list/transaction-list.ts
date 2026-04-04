import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Transaction, TransactionListResponse, TransactionSummary } from '../../models/transaction.model';
import { TransactionService } from '../../services/transaction.service';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transaction-list.html',
  styleUrl: './transaction-list.css'
})
export class TransactionListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() projectId = '';
  @Input() compact = false;

  @Output() addTransaction = new EventEmitter<void>();
  @Output() editTransaction = new EventEmitter<Transaction>();
  @Output() deleteTransaction = new EventEmitter<Transaction>();

  transactions: Transaction[] = [];
  summary: TransactionSummary = { totalDebit: 0, totalCredit: 0, netAmount: 0, count: 0 };
  loading = false;

  activeFilter: 'all' | 'debit' | 'credit' = 'all';
  selectedCategory = '';
  categories: string[] = [];

  currentPage = 1;
  totalPages = 1;
  pageSize = 20;

  private currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });

  private destroy$ = new Subject<void>();

  constructor(private transactionService: TransactionService) {}

  ngOnInit(): void {
    if (this.projectId) {
      this.loadTransactions();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange && this.projectId) {
      this.currentPage = 1;
      this.activeFilter = 'all';
      this.selectedCategory = '';
      this.loadTransactions();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTransactions(): void {
    this.loading = true;
    const type = this.activeFilter === 'all' ? undefined : this.activeFilter;
    const category = this.selectedCategory || undefined;

    this.transactionService
      .getTransactions(this.projectId, this.currentPage, this.pageSize, type, category)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.transactions = response.data || [];
          const s = response.summary || {};
          this.summary = {
            totalDebit: s.totalDebits || s.totalDebit || 0,
            totalCredit: s.totalCredits || s.totalCredit || 0,
            netAmount: s.netAmount || 0,
            count: s.transactionCount || s.count || 0
          };
          this.totalPages = response.pagination?.totalPages || 1;
          this.currentPage = response.pagination?.page || 1;
          this.extractCategories();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });
  }

  private extractCategories(): void {
    const cats = new Set<string>();
    this.transactions.forEach(t => {
      if (t.category) cats.add(t.category);
    });
    this.categories = Array.from(cats).sort();
  }

  setFilter(filter: 'all' | 'debit' | 'credit'): void {
    this.activeFilter = filter;
    this.currentPage = 1;
    this.loadTransactions();
  }

  onCategoryChange(): void {
    this.currentPage = 1;
    this.loadTransactions();
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadTransactions();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadTransactions();
    }
  }

  onAddTransaction(): void {
    this.addTransaction.emit();
  }

  onEditTransaction(transaction: Transaction): void {
    this.editTransaction.emit(transaction);
  }

  onDeleteTransaction(transaction: Transaction): void {
    this.deleteTransaction.emit(transaction);
  }

  formatCurrency(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  getPaymentMethodIcon(method: string): string {
    switch (method) {
      case 'cash': return 'fas fa-money-bill-wave';
      case 'bank_transfer': return 'fas fa-university';
      case 'upi': return 'fas fa-mobile-alt';
      case 'cheque': return 'fas fa-money-check';
      case 'card': return 'fas fa-credit-card';
      default: return 'fas fa-receipt';
    }
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
