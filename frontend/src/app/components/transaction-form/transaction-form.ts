import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Transaction, TransactionType, PaymentMethod, Vendor } from '../../models/transaction.model';
import { TransactionService } from '../../services/transaction.service';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.css'
})
export class TransactionFormComponent implements OnChanges {
  @Input() projectId!: string;
  @Input() transaction: Transaction | null = null;
  @Input() visible: boolean = false;

  @Output() saved = new EventEmitter<Transaction>();
  @Output() cancelled = new EventEmitter<void>();

  type: TransactionType = 'debit';
  description = '';
  amount: number | null = null;
  category = '';
  date = '';
  paymentMethod: PaymentMethod = 'cash';
  vendorName = '';
  vendorPhone = '';
  referenceNumber = '';
  invoiceNumber = '';
  tags = '';

  saving = false;

  categories = [
    'Seeds', 'Fertilizer', 'Pesticide', 'Labor', 'Equipment',
    'Transport', 'Irrigation', 'Consulting', 'Soil Testing',
    'Harvest', 'Sale', 'Rent', 'Government Subsidy', 'Insurance', 'Miscellaneous'
  ];

  paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'upi', label: 'UPI' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' }
  ];

  constructor(private transactionService: TransactionService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      if (this.transaction) {
        this.populateForm(this.transaction);
      } else {
        this.resetForm();
      }
    }
  }

  get isEditMode(): boolean {
    return !!this.transaction;
  }

  get isFormValid(): boolean {
    return !!this.description.trim() && !!this.amount && this.amount > 0 && !!this.category;
  }

  private populateForm(t: Transaction): void {
    this.type = t.type;
    this.description = t.description;
    this.amount = t.amount;
    this.category = t.category;
    this.date = t.date ? t.date.substring(0, 10) : this.todayString();
    this.paymentMethod = t.paymentMethod || 'cash';
    this.vendorName = t.vendor?.name || '';
    this.vendorPhone = t.vendor?.phone || '';
    this.referenceNumber = t.referenceNumber || '';
    this.invoiceNumber = t.invoiceNumber || '';
    this.tags = t.tags?.join(', ') || '';
  }

  private resetForm(): void {
    this.type = 'debit';
    this.description = '';
    this.amount = null;
    this.category = '';
    this.date = this.todayString();
    this.paymentMethod = 'cash';
    this.vendorName = '';
    this.vendorPhone = '';
    this.referenceNumber = '';
    this.invoiceNumber = '';
    this.tags = '';
  }

  private todayString(): string {
    return new Date().toISOString().substring(0, 10);
  }

  setType(t: TransactionType): void {
    this.type = t;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close();
    }
  }

  close(): void {
    this.cancelled.emit();
  }

  save(): void {
    if (!this.isFormValid || this.saving) return;

    this.saving = true;

    const vendor: Vendor | undefined = this.vendorName.trim()
      ? { name: this.vendorName.trim(), phone: this.vendorPhone.trim() || undefined }
      : undefined;

    const parsedTags = this.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const payload: Partial<Transaction> = {
      projectId: this.projectId,
      type: this.type,
      description: this.description.trim(),
      amount: this.amount!,
      category: this.category,
      date: this.date || this.todayString(),
      paymentMethod: this.paymentMethod,
      vendor,
      referenceNumber: this.referenceNumber.trim() || undefined,
      invoiceNumber: this.invoiceNumber.trim() || undefined,
      tags: parsedTags
    };

    const request$ = this.isEditMode
      ? this.transactionService.updateTransaction(this.transaction!._id, payload)
      : this.transactionService.createTransaction(payload);

    request$.subscribe({
      next: (result) => {
        this.saving = false;
        this.saved.emit(result);
      },
      error: () => {
        this.saving = false;
      }
    });
  }
}
