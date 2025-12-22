import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface BulkPDFResponse {
  count: number;
  pdfs: {
    sampleId: string;
    farmerName: string;
    pdf: string; // base64 encoded
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class PdfService {
  private apiUrl = `${environment.apiUrl}/pdf`;

  constructor(private http: HttpClient) {}

  /**
   * Generate and download PDF for a single sample
   */
  generateSinglePDF(sampleId: string): Observable<Blob> {
    return this.http.post(
      `${this.apiUrl}/sample/${sampleId}`,
      {},
      { responseType: 'blob' }
    );
  }

  /**
   * Download the PDF blob
   */
  downloadPDF(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Preview PDF in a new tab
   */
  previewPDF(sampleId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/sample/${sampleId}/preview`,
      { responseType: 'blob' }
    );
  }

  /**
   * Open PDF in new tab
   */
  openPDFInNewTab(blob: Blob): void {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Note: URL will be cleaned up when the tab is closed
  }

  /**
   * Generate combined PDF for all samples in a session
   */
  generateCombinedSessionPDF(sessionId: string): Observable<Blob> {
    return this.http.post(
      `${this.apiUrl}/session/${sessionId}/combined`,
      {},
      { responseType: 'blob' }
    );
  }

  /**
   * Generate bulk PDFs for a session (returns array of base64 PDFs)
   */
  generateBulkSessionPDFs(sessionId: string): Observable<BulkPDFResponse> {
    return this.http.post<BulkPDFResponse>(
      `${this.apiUrl}/session/${sessionId}/bulk`,
      {}
    );
  }

  /**
   * Generate PDFs for multiple specific samples
   */
  generateMultiplePDFs(sampleIds: string[], combined: boolean = false): Observable<any> {
    if (combined) {
      return this.http.post(
        `${this.apiUrl}/samples/multiple`,
        { sampleIds, combined: true },
        { responseType: 'blob' }
      );
    } else {
      return this.http.post<BulkPDFResponse>(
        `${this.apiUrl}/samples/multiple`,
        { sampleIds, combined: false }
      );
    }
  }

  /**
   * Download bulk PDFs from base64 response
   */
  downloadBulkPDFs(response: BulkPDFResponse): void {
    response.pdfs.forEach((pdfData, index) => {
      try {
        // Clean the base64 string (remove whitespace, newlines, and data URI prefix if present)
        let cleanBase64 = pdfData.pdf.replace(/\s/g, '');

        // Remove data URI prefix if present (e.g., "data:application/pdf;base64,")
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }

        // Validate base64 string
        if (!cleanBase64 || cleanBase64.length === 0) {
          throw new Error('Empty base64 string');
        }

        // Convert base64 to blob using fetch API (more robust than atob for large files)
        const byteString = atob(cleanBase64);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);

        for (let i = 0; i < byteString.length; i++) {
          uint8Array[i] = byteString.charCodeAt(i);
        }

        const blob = new Blob([uint8Array], { type: 'application/pdf' });

        // Download with delay to avoid browser blocking
        setTimeout(() => {
          const farmerName = pdfData.farmerName || 'Unknown';
          const filename = `જમીન ચકાસણી - ${farmerName}.pdf`;
          this.downloadPDF(blob, filename);
        }, index * 500); // 500ms delay between downloads
      } catch (error) {
        console.error(`Error decoding PDF for ${pdfData.farmerName}:`, error);
      }
    });
  }

  /**
   * Generate and download a single PDF
   */
  async downloadSinglePDF(sampleId: string, filename?: string): Promise<void> {
    try {
      const blob = await this.generateSinglePDF(sampleId).toPromise();
      if (blob) {
        const defaultFilename = filename || `જમીન ચકાસણી - ${new Date().toISOString().split('T')[0]}.pdf`;
        this.downloadPDF(blob, defaultFilename);
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and preview a single PDF
   */
  async previewSinglePDF(sampleId: string): Promise<void> {
    try {
      const blob = await this.previewPDF(sampleId).toPromise();
      if (blob) {
        this.openPDFInNewTab(blob);
      }
    } catch (error) {
      console.error('Error previewing PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and download combined session PDF
   */
  async downloadCombinedSessionPDF(sessionId: string, filename?: string): Promise<void> {
    try {
      const blob = await this.generateCombinedSessionPDF(sessionId).toPromise();
      if (blob) {
        const defaultFilename = filename || `જમીન ચકાસણી - Combined_${new Date().toISOString().split('T')[0]}.pdf`;
        this.downloadPDF(blob, defaultFilename);
      }
    } catch (error) {
      console.error('Error downloading combined PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and download all PDFs for a session individually
   */
  async downloadBulkSessionPDFs(sessionId: string): Promise<void> {
    try {
      const response = await this.generateBulkSessionPDFs(sessionId).toPromise();
      if (response) {
        this.downloadBulkPDFs(response);
      }
    } catch (error) {
      console.error('Error downloading bulk PDFs:', error);
      throw error;
    }
  }

  /**
   * Check PDF service health
   */
  checkHealth(): Observable<{ status: string; service: string }> {
    return this.http.get<{ status: string; service: string }>(`${this.apiUrl}/health`);
  }

  // =============== WATER TESTING PDF METHODS ===============

  /**
   * Generate and download PDF for a single water sample
   */
  generateWaterSamplePDF(sampleId: string): Observable<Blob> {
    return this.http.post(
      `${environment.apiUrl}/water-testing/samples/${sampleId}/pdf`,
      {},
      { responseType: 'blob' }
    );
  }

  /**
   * Generate and download all PDFs for a water testing session (returns base64 encoded PDFs)
   */
  generateBulkWaterPDFs(sessionId: string): Observable<BulkPDFResponse> {
    return this.http.post<BulkPDFResponse>(
      `${environment.apiUrl}/water-testing/sessions/${sessionId}/pdfs`,
      {}
    );
  }

  /**
   * Generate and download combined PDF for all water samples in a session
   */
  generateCombinedWaterPDF(sessionId: string): Observable<Blob> {
    return this.http.post(
      `${environment.apiUrl}/water-testing/sessions/${sessionId}/pdf-combined`,
      {},
      { responseType: 'blob' }
    );
  }

  /**
   * Download water sample PDF
   */
  async downloadWaterSamplePDF(sampleId: string, filename?: string): Promise<void> {
    try {
      const blob = await this.generateWaterSamplePDF(sampleId).toPromise();
      if (blob) {
        const defaultFilename = filename || `પાણી ચકાસણી - ${new Date().toISOString().split('T')[0]}.pdf`;
        this.downloadPDF(blob, defaultFilename);
      }
    } catch (error) {
      console.error('Error downloading water PDF:', error);
      throw error;
    }
  }

  /**
   * Download all water PDFs for a session (individual downloads with delay)
   */
  async downloadBulkWaterPDFs(sessionId: string): Promise<void> {
    try {
      const response = await this.generateBulkWaterPDFs(sessionId).toPromise();
      if (response) {
        this.downloadBulkWaterPDFsHelper(response);
      }
    } catch (error) {
      console.error('Error downloading bulk water PDFs:', error);
      throw error;
    }
  }

  /**
   * Download bulk water PDFs from base64 response
   */
  private downloadBulkWaterPDFsHelper(response: BulkPDFResponse): void {
    response.pdfs.forEach((pdfData, index) => {
      try {
        // Clean the base64 string (remove whitespace and newlines)
        const cleanBase64 = pdfData.pdf.replace(/\s/g, '');

        // Convert base64 to blob
        const byteCharacters = atob(cleanBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });

        // Download with delay to avoid browser blocking
        setTimeout(() => {
          const farmerName = pdfData.farmerName || 'Unknown';
          const filename = `પાણી ચકાસણી - ${farmerName}.pdf`;
          this.downloadPDF(blob, filename);
        }, index * 500); // 500ms delay between downloads
      } catch (error) {
        console.error(`Error decoding PDF for ${pdfData.farmerName}:`, error);
      }
    });
  }

  /**
   * Download combined water PDF for a session
   */
  async downloadCombinedWaterSessionPDF(sessionId: string, filename?: string): Promise<void> {
    try {
      const blob = await this.generateCombinedWaterPDF(sessionId).toPromise();
      if (blob) {
        const defaultFilename = filename || `પાણી ચકાસણી - Combined_${new Date().toISOString().split('T')[0]}.pdf`;
        this.downloadPDF(blob, defaultFilename);
      }
    } catch (error) {
      console.error('Error downloading combined water PDF:', error);
      throw error;
    }
  }
}
