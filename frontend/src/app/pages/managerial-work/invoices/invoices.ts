import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ManagerialWorkService,
  Invoice,
  InvoiceLineItem,
  InvoiceFilters,
} from '../../../services/managerial-work.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmationModalService } from '../../../services/confirmation-modal.service';
import { HasPermissionDirective } from '../../../directives/has-permission.directive';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  providers: [ManagerialWorkService],
  templateUrl: './invoices.html',
  styleUrls: ['./invoices.css'],
})
export class InvoicesComponent implements OnInit {
  currentView: 'list' | 'form' = 'list';
  isEditing: boolean = false;

  invoices: Invoice[] = [];
  currentInvoice: Partial<Invoice> = this.getEmptyInvoice();
  serviceOptions: any[] = [];

  filters: InvoiceFilters = {
    page: 1,
    limit: 20,
    includeDrafts: false,
  };

  totalInvoices: number = 0;
  totalPages: number = 0;
  totalAmount: number = 0;
  totalPaid: number = 0;
  totalUnpaid: number = 0;

  isLoading: boolean = false;
  isSaving: boolean = false;
  searchTerm: string = '';
  showFilters: boolean = false;

  constructor(
    private managerialService: ManagerialWorkService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadInvoices();
    this.loadServiceOptions();
  }

  getEmptyInvoice(): Partial<Invoice> {
    return {
      invoiceNumber: '',
      invoiceType: 'cash',
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      items: this.getStaticItems(),
      subtotal: 0,
      grandTotal: 0,
      grandTotalInWords: '',
      isDraft: false,
    };
  }

  getStaticItems(): InvoiceLineItem[] {
    return [
      {
        serialNumber: 1,
        description: 'N.P.K., Ph. & EC',
        descriptionGujarati: 'જમીનની ચકાસણી',
        rate: 0,
        quantity: 0,
        total: 0
      },
      {
        serialNumber: 2,
        description: 'Zn, Fe, Mn & Cu',
        descriptionGujarati: 'સુક્ષ્મ તત્વોની ચકાસણી',
        rate: 0,
        quantity: 0,
        total: 0
      },
      {
        serialNumber: 3,
        description: '',
        descriptionGujarati: 'પિયત પાણીની ચકાસણી',
        rate: 0,
        quantity: 0,
        total: 0
      },
      {
        serialNumber: 4,
        description: '',
        descriptionGujarati: 'પીવા માટે પાણી, કેમીકલ ટેસ્ટ',
        rate: 0,
        quantity: 0,
        total: 0
      },
      {
        serialNumber: 5,
        description: '',
        descriptionGujarati: 'બેક્ટેરીયાલોજી ટેસ્ટ',
        rate: 0,
        quantity: 0,
        total: 0
      },
      {
        serialNumber: 6,
        description: 'Consulting',
        descriptionGujarati: 'કન્સલ્ટન્સી ફી',
        rate: 0,
        quantity: 0,
        total: 0
      },
      {
        serialNumber: 7,
        description: '',
        descriptionGujarati: 'અન્ય',
        rate: 0,
        quantity: 0,
        total: 0
      }
    ];
  }

  loadInvoices(): void {
    this.isLoading = true;
    this.managerialService.getInvoices(this.filters).subscribe({
      next: (response) => {
        this.invoices = response.invoices;
        this.totalInvoices = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.totalAmount = response.summary?.totalAmount || 0;
        this.totalPaid = response.summary?.totalPaid || 0;
        this.totalUnpaid = response.summary?.totalUnpaid || 0;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading invoices:', error);
        this.toastService.error('Failed to load invoices');
        this.isLoading = false;
      },
    });
  }

  loadServiceOptions(): void {
    this.managerialService.getServiceOptions().subscribe({
      next: (response) => {
        this.serviceOptions = response.services;
      },
      error: (error) => {
        console.error('Error loading service options:', error);
      },
    });
  }

  applySearch(): void {
    this.filters.search = this.searchTerm;
    this.filters.page = 1;
    this.loadInvoices();
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadInvoices();
  }

  clearFilters(): void {
    this.filters = { page: 1, limit: 20, includeDrafts: false };
    this.searchTerm = '';
    this.loadInvoices();
  }

  toggleDrafts(): void {
    this.filters.includeDrafts = !this.filters.includeDrafts;
    this.applyFilters();
  }

  changePage(page: number): void {
    this.filters.page = page;
    this.loadInvoices();
  }

  showCreateForm(): void {
    this.isEditing = false;
    this.currentInvoice = this.getEmptyInvoice();

    this.managerialService.getNextInvoiceNumber().subscribe({
      next: (response) => {
        this.currentInvoice.invoiceNumber = response.invoiceNumber;
        this.currentView = 'form';
      },
      error: (error) => {
        console.error('Error getting invoice number:', error);
        this.toastService.error('Failed to generate invoice number');
      },
    });
  }

  editInvoice(invoice: Invoice): void {
    this.isEditing = true;
    this.currentInvoice = { ...invoice, items: [...invoice.items] };

    // Ensure we have static items structure
    if (!this.currentInvoice.items || this.currentInvoice.items.length === 0) {
      this.currentInvoice.items = this.getStaticItems();
    }

    this.currentView = 'form';
  }

  cancelForm(): void {
    this.currentView = 'list';
    this.currentInvoice = this.getEmptyInvoice();
  }

  addLineItem(): void {
    if (!this.currentInvoice.items) {
      this.currentInvoice.items = [];
    }

    this.currentInvoice.items.push({
      serialNumber: this.currentInvoice.items.length + 1,
      description: '',
      descriptionGujarati: '',
      rate: 0,
      quantity: 1,
      total: 0,
    });
  }

  removeLineItem(index: number): void {
    this.currentInvoice.items?.splice(index, 1);
    this.recalculateSerialNumbers();
    this.calculateTotals();
  }

  recalculateSerialNumbers(): void {
    this.currentInvoice.items?.forEach((item, index) => {
      item.serialNumber = index + 1;
    });
  }

  onLineItemChange(item: InvoiceLineItem): void {
    item.total = item.rate * item.quantity;
    this.calculateTotals();
  }

  calculateTotals(): void {
    const subtotal =
      this.currentInvoice.items?.reduce((sum, item) => sum + item.total, 0) ||
      0;
    this.currentInvoice.subtotal = subtotal;
    this.currentInvoice.grandTotal =
      subtotal +
      (this.currentInvoice.taxAmount || 0) -
      (this.currentInvoice.discount || 0);

    // Calculate amount in words
    if (this.currentInvoice.grandTotal > 0) {
      this.currentInvoice.grandTotalInWords = this.managerialService.numberToWords(
        this.currentInvoice.grandTotal
      );
    } else {
      this.currentInvoice.grandTotalInWords = '';
    }
  }

  selectServiceTemplate(service: any, item: InvoiceLineItem): void {
    item.description = service.labelEn;
    item.descriptionGujarati = service.labelGu;
  }

  saveInvoice(asDraft: boolean = false): void {
    // Skip validation when saving as draft
    if (!asDraft && !this.validateInvoice()) {
      return;
    }

    this.currentInvoice.isDraft = asDraft;
    this.isSaving = true;

    const saveOperation = this.isEditing
      ? this.managerialService.updateInvoice(
          this.currentInvoice.id!,
          this.currentInvoice
        )
      : this.managerialService.createInvoice(this.currentInvoice);

    saveOperation.subscribe({
      next: (response) => {
        this.toastService.success(
          `Invoice ${asDraft ? 'saved as draft' : this.isEditing ? 'updated' : 'created'} successfully`
        );
        this.isSaving = false;
        this.currentView = 'list';
        this.loadInvoices();

        // Auto-download PDF if not a draft
        if (!asDraft && response.id) {
          this.generatePDF(response);
        }
      },
      error: (error) => {
        console.error('Error saving invoice:', error);
        this.toastService.error('Failed to save invoice');
        this.isSaving = false;
      },
    });
  }

  validateInvoice(): boolean {
    if (!this.currentInvoice.customerName?.trim()) {
      this.toastService.error('Customer name is required');
      return false;
    }

    if (!this.currentInvoice.items || this.currentInvoice.items.length === 0) {
      this.toastService.error('At least one line item is required');
      return false;
    }

    for (const item of this.currentInvoice.items) {
      if (!item.descriptionGujarati?.trim() && !item.description?.trim()) {
        this.toastService.error('All line items must have a Gujarati or English description');
        return false;
      }
      if (item.rate < 0) {
        this.toastService.error('Rate cannot be negative');
        return false;
      }
      if (item.quantity < 0) {
        this.toastService.error('Quantity cannot be negative');
        return false;
      }
    }

    return true;
  }

  async deleteInvoice(invoice: Invoice): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete Invoice',
      message: `Are you sure you want to delete invoice ${invoice.invoiceNumber}?`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash'
    });

    if (confirmed) {
      this.managerialService.deleteInvoice(invoice.id!).subscribe({
        next: () => {
          this.toastService.success('Invoice deleted successfully');
          this.loadInvoices();
        },
        error: (error) => {
          console.error('Error deleting invoice:', error);
          this.toastService.error('Failed to delete invoice');
        },
      });
    }
  }

  duplicateInvoice(invoice: Invoice): void {
    this.managerialService.duplicateInvoice(invoice.id!).subscribe({
      next: (newInvoice) => {
        this.toastService.success('Invoice duplicated successfully');
        this.loadInvoices();
      },
      error: (error) => {
        console.error('Error duplicating invoice:', error);
        this.toastService.error('Failed to duplicate invoice');
      },
    });
  }

  updatePaymentStatus(invoice: Invoice): void {
    if (!invoice.id) return;

    this.managerialService.updatePaymentStatus(invoice.id, {
      paymentStatus: invoice.paymentStatus || 'unpaid'
    }).subscribe({
      next: () => {
        this.toastService.success('Payment status updated successfully');
        this.loadInvoices();
      },
      error: (error) => {
        console.error('Error updating payment status:', error);
        this.toastService.error('Failed to update payment status');
        this.loadInvoices(); // Reload to revert the UI change
      },
    });
  }

  hasPermission(permission: string): boolean {
    // This would check against actual user permissions
    // For now, returning true - you can integrate with your permission system
    return true;
  }

  generatePDF(invoice: Invoice): void {
    this.managerialService.generateInvoicePDF(invoice.id!).subscribe({
      next: (blob) => {
        const filename = `Invoice_${invoice.invoiceNumber}_${invoice.customerName}.pdf`;
        this.managerialService.downloadFile(blob, filename);
        this.toastService.success('PDF generated successfully');
      },
      error: (error) => {
        console.error('Error generating PDF:', error);
        this.toastService.error('Failed to generate PDF');
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

  getPaymentStatusBadge(status: string): string {
    const badges: any = {
      paid: 'badge-success',
      partial: 'badge-warning',
      unpaid: 'badge-danger',
    };
    return badges[status] || 'badge-secondary';
  }

  getPaymentStatusLabel(status: string): string {
    const labels: any = {
      paid: 'Paid',
      partial: 'Partial',
      unpaid: 'Unpaid',
    };
    return labels[status] || status;
  }

  getInvoiceTypeLabel(type: string): string {
    const labels: any = {
      cash: 'કેશ મેમો',
      debit_memo: 'ડેબીટ મેમો',
    };
    return labels[type] || 'કેશ મેમો';
  }
}
