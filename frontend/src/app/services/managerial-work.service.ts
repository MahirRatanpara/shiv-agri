import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

// Interfaces
export interface Receipt {
  id?: string;
  receiptNumber: string;
  date: Date | string;
  customerName: string;
  customerAddress?: string;
  amount: number;
  amountInWords?: string;
  paymentMethod: 'cheque' | 'bank_transfer' | 'cash';
  chequeNumber?: string;
  bankName?: string;
  paymentType: 'full_payment' | 'part_payment' | 'advance_payment';
  billReference?: string;
  billDate?: Date | string;
  remarks?: string;
  pdfUrl?: string;
  pdfGeneratedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: any;
}

export interface InvoiceLineItem {
  serialNumber: number;
  description: string;
  descriptionGujarati?: string;
  rate: number;
  quantity: number;
  total: number;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  invoiceType?: 'cash' | 'debit_memo';
  date: Date | string;
  customerName: string;
  referenceNumber?: string;
  location?: string;
  village?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxAmount?: number;
  discount?: number;
  grandTotal: number;
  grandTotalInWords?: string;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
  linkedReceipts?: string[];
  consultantName?: string;
  consultantCredentials?: string;
  pdfUrl?: string;
  pdfGeneratedAt?: Date;
  remarks?: string;
  isDraft?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: any;
}

export interface Letter {
  id?: string;
  letterNumber?: string;
  date: Date | string;
  letterType: 'service_list' | 'general' | 'custom';
  subject?: string;
  recipientName?: string;
  recipientAddress?: string;
  content: string;
  contentPlainText?: string;
  tags?: string[];
  companyName?: string;
  consultantName?: string;
  consultantCredentials?: string;
  contactPhone?: string;
  contactEmail?: string;
  companyAddress?: string;
  pdfUrl?: string;
  pdfGeneratedAt?: Date;
  isDraft?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: any;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface ReceiptFilters extends PaginationParams {
  paymentMethod?: string;
  paymentType?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface InvoiceFilters extends PaginationParams {
  paymentStatus?: string;
  minAmount?: number;
  maxAmount?: number;
  includeDrafts?: boolean;
}

export interface LetterFilters extends PaginationParams {
  letterType?: string;
  tags?: string[];
  includeDrafts?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ManagerialWorkService {
  private apiUrl = `${environment.apiUrl}/managerial-work`;
  private pdfUrl = `${environment.apiUrl}/pdf`;

  constructor(private http: HttpClient) {}

  // ============ RECEIPT METHODS ============

  getReceipts(filters?: ReceiptFilters): Observable<any> {
    let params = new HttpParams();

    if (filters) {
      Object.keys(filters).forEach((key) => {
        const value = filters[key as keyof ReceiptFilters];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value.toString());
        }
      });
    }

    return this.http.get(`${this.apiUrl}/receipts`, { params });
  }

  getReceiptById(id: string): Observable<Receipt> {
    return this.http.get<Receipt>(`${this.apiUrl}/receipts/${id}`);
  }

  createReceipt(receipt: Partial<Receipt>): Observable<Receipt> {
    return this.http.post<Receipt>(`${this.apiUrl}/receipts`, receipt);
  }

  updateReceipt(id: string, receipt: Partial<Receipt>): Observable<Receipt> {
    return this.http.put<Receipt>(`${this.apiUrl}/receipts/${id}`, receipt);
  }

  deleteReceipt(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/receipts/${id}`);
  }

  getNextReceiptNumber(): Observable<{ receiptNumber: string }> {
    return this.http.get<{ receiptNumber: string }>(
      `${this.apiUrl}/receipts/next-number`
    );
  }

  generateReceiptPDF(id: string): Observable<Blob> {
    return this.http.post(`${this.pdfUrl}/receipt/${id}`, null, {
      responseType: 'blob',
    });
  }

  // ============ INVOICE METHODS ============

  getInvoices(filters?: InvoiceFilters): Observable<any> {
    let params = new HttpParams();

    if (filters) {
      Object.keys(filters).forEach((key) => {
        const value = filters[key as keyof InvoiceFilters];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value.toString());
        }
      });
    }

    return this.http.get(`${this.apiUrl}/invoices`, { params });
  }

  getInvoiceById(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.apiUrl}/invoices/${id}`);
  }

  createInvoice(invoice: Partial<Invoice>): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.apiUrl}/invoices`, invoice);
  }

  updateInvoice(id: string, invoice: Partial<Invoice>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.apiUrl}/invoices/${id}`, invoice);
  }

  updatePaymentStatus(
    id: string,
    paymentData: {
      paymentStatus?: string;
      paidAmount?: number;
      receiptId?: string;
    }
  ): Observable<Invoice> {
    return this.http.put<Invoice>(
      `${this.apiUrl}/invoices/${id}/payment`,
      paymentData
    );
  }

  deleteInvoice(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/invoices/${id}`);
  }

  duplicateInvoice(id: string): Observable<Invoice> {
    return this.http.post<Invoice>(
      `${this.apiUrl}/invoices/${id}/duplicate`,
      null
    );
  }

  getNextInvoiceNumber(): Observable<{ invoiceNumber: string }> {
    return this.http.get<{ invoiceNumber: string }>(
      `${this.apiUrl}/invoices/next-number`
    );
  }

  getServiceOptions(): Observable<{ services: any[] }> {
    return this.http.get<{ services: any[] }>(
      `${this.apiUrl}/invoices/service-options`
    );
  }

  generateInvoicePDF(id: string): Observable<Blob> {
    return this.http.post(`${this.pdfUrl}/invoice/${id}`, null, {
      responseType: 'blob',
    });
  }

  // ============ LETTER METHODS ============

  getLetters(filters?: LetterFilters): Observable<any> {
    let params = new HttpParams();

    if (filters) {
      Object.keys(filters).forEach((key) => {
        const value = filters[key as keyof LetterFilters];
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            value.forEach((v) => (params = params.append(key, v)));
          } else {
            params = params.set(key, value.toString());
          }
        }
      });
    }

    return this.http.get(`${this.apiUrl}/letters`, { params });
  }

  getLetterById(id: string): Observable<Letter> {
    return this.http.get<Letter>(`${this.apiUrl}/letters/${id}`);
  }

  createLetter(letter: Partial<Letter>): Observable<Letter> {
    return this.http.post<Letter>(`${this.apiUrl}/letters`, letter);
  }

  updateLetter(id: string, letter: Partial<Letter>): Observable<Letter> {
    return this.http.put<Letter>(`${this.apiUrl}/letters/${id}`, letter);
  }

  deleteLetter(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/letters/${id}`);
  }

  getNextLetterNumber(): Observable<{ letterNumber: string }> {
    return this.http.get<{ letterNumber: string }>(
      `${this.apiUrl}/letters/next-number`
    );
  }

  getServiceListTemplate(): Observable<{ template: string }> {
    return this.http.get<{ template: string }>(
      `${this.apiUrl}/letters/template/service-list`
    );
  }

  getAllTags(): Observable<{ tags: string[] }> {
    return this.http.get<{ tags: string[] }>(`${this.apiUrl}/letters/tags`);
  }

  generateLetterPDF(id: string): Observable<Blob> {
    return this.http.post(`${this.pdfUrl}/letter/${id}`, null, {
      responseType: 'blob',
    });
  }

  // ============ UTILITY METHODS ============

  /**
   * Convert number to Indian Rupees words
   */
  numberToWords(num: number): string {
    if (num === 0) return 'Zero Rupees Only';

    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convertLessThanThousand = (n: number): string => {
      if (n === 0) return '';
      if (n < 10) return units[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + units[n % 10] : '');
      return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertLessThanThousand(n % 100) : '');
    };

    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const remainder = num % 1000;

    let result = '';

    if (crore) result += convertLessThanThousand(crore) + ' Crore ';
    if (lakh) result += convertLessThanThousand(lakh) + ' Lakh ';
    if (thousand) result += convertLessThanThousand(thousand) + ' Thousand ';
    if (remainder) result += convertLessThanThousand(remainder);

    return result.trim() + ' Rupees Only';
  }

  /**
   * Download blob as file
   */
  downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
