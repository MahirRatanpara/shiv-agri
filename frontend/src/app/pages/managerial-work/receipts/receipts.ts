import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ManagerialWorkService,
  Receipt,
  ReceiptFilters,
} from '../../../services/managerial-work.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmationModalService } from '../../../services/confirmation-modal.service';
import { HasPermissionDirective } from '../../../directives/has-permission.directive';

@Component({
  selector: 'app-receipts',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  providers: [ManagerialWorkService],
  templateUrl: './receipts.html',
  styleUrls: ['./receipts.css'],
})
export class ReceiptsComponent implements OnInit {
  // View mode
  currentView: 'list' | 'form' = 'list';
  isEditing: boolean = false;

  // Receipt data
  receipts: Receipt[] = [];
  currentReceipt: Partial<Receipt> = this.getEmptyReceipt();

  // Filters
  filters: ReceiptFilters = {
    page: 1,
    limit: 20,
  };

  // Pagination
  totalReceipts: number = 0;
  totalPages: number = 0;
  totalAmount: number = 0;

  // Loading states
  isLoading: boolean = false;
  isSaving: boolean = false;
  isGeneratingPDF: boolean = false;

  // Search and filter UI
  searchTerm: string = '';
  showFilters: boolean = false;

  // Additional UI fields (not stored in DB)
  billDate: string = '';
  customerAddress: string = '';

  constructor(
    private managerialService: ManagerialWorkService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadReceipts();
  }

  getEmptyReceipt(): Partial<Receipt> {
    return {
      receiptNumber: '',
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      amount: 0,
      amountInWords: '',
      paymentMethod: 'cash',
      paymentType: 'full_payment',
      chequeNumber: '',
      bankName: '',
      billReference: '',
      remarks: '',
    };
  }

  loadReceipts(): void {
    this.isLoading = true;
    this.managerialService.getReceipts(this.filters).subscribe({
      next: (response) => {
        this.receipts = response.receipts;
        this.totalReceipts = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.totalAmount = response.summary?.totalAmount || 0;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading receipts:', error);
        this.toastService.error('Failed to load receipts');
        this.isLoading = false;
      },
    });
  }

  applySearch(): void {
    this.filters.search = this.searchTerm;
    this.filters.page = 1;
    this.loadReceipts();
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadReceipts();
  }

  clearFilters(): void {
    this.filters = {
      page: 1,
      limit: 20,
    };
    this.searchTerm = '';
    this.loadReceipts();
  }

  changePage(page: number): void {
    this.filters.page = page;
    this.loadReceipts();
  }

  showCreateForm(): void {
    this.isEditing = false;
    this.currentReceipt = this.getEmptyReceipt();

    // Get next receipt number
    this.managerialService.getNextReceiptNumber().subscribe({
      next: (response) => {
        this.currentReceipt.receiptNumber = response.receiptNumber;
        this.currentView = 'form';
      },
      error: (error) => {
        console.error('Error getting receipt number:', error);
        this.toastService.error('Failed to generate receipt number');
      },
    });
  }

  editReceipt(receipt: Receipt): void {
    this.isEditing = true;
    this.currentReceipt = { ...receipt };
    // Populate UI-only fields from receipt data
    this.customerAddress = receipt.customerAddress || '';
    this.billDate = receipt.billDate ? new Date(receipt.billDate).toISOString().split('T')[0] : '';
    this.currentView = 'form';
  }

  cancelForm(): void {
    this.currentView = 'list';
    this.currentReceipt = this.getEmptyReceipt();
    this.customerAddress = '';
    this.billDate = '';
  }

  onAmountChange(): void {
    if (this.currentReceipt.amount) {
      this.currentReceipt.amountInWords = this.managerialService.numberToWords(
        this.currentReceipt.amount
      );
    }
  }

  saveReceipt(): void {
    if (!this.validateReceipt()) {
      return;
    }

    this.isSaving = true;

    // Copy UI-only fields to currentReceipt before saving
    this.currentReceipt.customerAddress = this.customerAddress;
    this.currentReceipt.billDate = this.billDate;

    const saveOperation = this.isEditing
      ? this.managerialService.updateReceipt(
          this.currentReceipt.id!,
          this.currentReceipt
        )
      : this.managerialService.createReceipt(this.currentReceipt);

    saveOperation.subscribe({
      next: (response) => {
        this.toastService.success(
          this.isEditing
            ? 'Receipt updated successfully'
            : 'Receipt created successfully'
        );

        // Automatically generate and download PDF after save
        if (response.id) {
          this.managerialService.generateReceiptPDF(response.id).subscribe({
            next: (blob) => {
              const filename = `Receipt_${response.receiptNumber}_${response.customerName}.pdf`;
              this.managerialService.downloadFile(blob, filename);
            },
            error: (error) => {
              console.error('Error generating PDF:', error);
              // Don't show error toast, just log it - receipt was saved successfully
            }
          });
        }

        this.isSaving = false;
        this.currentView = 'list';
        this.loadReceipts();
      },
      error: (error) => {
        console.error('Error saving receipt:', error);
        this.toastService.error('Failed to save receipt');
        this.isSaving = false;
      },
    });
  }

  validateReceipt(): boolean {
    if (!this.currentReceipt.customerName?.trim()) {
      this.toastService.error('Customer name is required');
      return false;
    }

    if (!this.currentReceipt.amount || this.currentReceipt.amount <= 0) {
      this.toastService.error('Valid amount is required');
      return false;
    }

    if (
      this.currentReceipt.paymentMethod === 'cheque' &&
      !this.currentReceipt.chequeNumber?.trim()
    ) {
      this.toastService.error('Cheque number is required');
      return false;
    }

    return true;
  }

  async deleteReceipt(receipt: Receipt): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete Receipt',
      message: `Are you sure you want to delete receipt ${receipt.receiptNumber}?`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash'
    });

    if (confirmed) {
      this.managerialService.deleteReceipt(receipt.id!).subscribe({
        next: () => {
          this.toastService.success('Receipt deleted successfully');
          this.loadReceipts();
        },
        error: (error) => {
          console.error('Error deleting receipt:', error);
          this.toastService.error('Failed to delete receipt');
        },
      });
    }
  }

  generatePDF(receipt: Receipt): void {
    this.isGeneratingPDF = true;
    this.managerialService.generateReceiptPDF(receipt.id!).subscribe({
      next: (blob) => {
        const filename = `Receipt_${receipt.receiptNumber}_${receipt.customerName}.pdf`;
        this.managerialService.downloadFile(blob, filename);
        this.toastService.success('PDF generated successfully');
        this.isGeneratingPDF = false;
      },
      error: (error) => {
        console.error('Error generating PDF:', error);
        this.toastService.error('Failed to generate PDF');
        this.isGeneratingPDF = false;
      },
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  }

  formatDate(date: any): string {
    return new Date(date).toLocaleDateString('en-IN');
  }

  getPaymentMethodLabel(method: string): string {
    const labels: any = {
      cheque: 'Cheque/D.D.',
      bank_transfer: 'Bank Transfer',
      cash: 'Cash',
    };
    return labels[method] || method;
  }

  getPaymentTypeLabel(type: string): string {
    const labels: any = {
      full_payment: 'Full Payment',
      part_payment: 'Part Payment',
      advance_payment: 'Advance Payment',
    };
    return labels[type] || type;
  }
}
