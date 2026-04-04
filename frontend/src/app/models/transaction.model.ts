export type TransactionType = 'debit' | 'credit';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'card' | 'other';

export interface Vendor {
  name: string;
  phone?: string;
  gst?: string;
}

export interface Transaction {
  _id: string;
  projectId: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  paymentMethod: PaymentMethod;
  vendor?: Vendor;
  referenceNumber?: string;
  receiptUrl?: string;
  invoiceNumber?: string;
  tags: string[];
  createdBy?: { _id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface TransactionSummary {
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  count: number;
  budget?: number;
  budgetUtilization?: number;
}

export interface CategoryBreakdown {
  _id: string;
  total: number;
  count: number;
  percentage?: number;
}

export interface MonthlyTrend {
  _id: { year: number; month: number };
  totalDebit: number;
  totalCredit: number;
  count: number;
}

export interface TransactionListResponse {
  success: boolean;
  data: {
    transactions: Transaction[];
    summary: TransactionSummary;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface TransactionResponse {
  success: boolean;
  data: Transaction;
  message?: string;
}
