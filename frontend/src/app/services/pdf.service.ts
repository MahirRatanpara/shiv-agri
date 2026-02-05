import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { DownloadProgressService } from './download-progress.service';

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

  constructor(
    private http: HttpClient,
    private downloadProgress: DownloadProgressService
  ) {}

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

      throw error;
    }
  }

  /**
   * Check PDF service health
   */
  checkHealth(): Observable<{ status: string; service: string }> {
    return this.http.get<{ status: string; service: string }>(`${this.apiUrl}/health`);
  }

  // =============== STREAMING PDF METHODS ===============

  /**
   * Get auth headers for fetch requests
   */
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('accessToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Stream and download bulk PDFs for a soil testing session
   * Downloads each PDF as it arrives from the server with progress tracking
   */
  async streamBulkSessionPDFs(
    sessionId: string,
    onProgress?: (current: number, total: number, farmerName: string) => void
  ): Promise<void> {
    const url = `${this.apiUrl}/session/${sessionId}/stream`;
    await this.processStreamingPDFs(url, 'જમીન ચકાસણી', 'Downloading Soil Reports', onProgress);
  }

  /**
   * Stream and download bulk PDFs for a water testing session
   * Downloads each PDF as it arrives from the server with progress tracking
   */
  async streamBulkWaterPDFs(
    sessionId: string,
    onProgress?: (current: number, total: number, farmerName: string) => void
  ): Promise<void> {
    const url = `${environment.apiUrl}/water-testing/sessions/${sessionId}/pdfs-stream`;
    await this.processStreamingPDFs(url, 'પાણી ચકાસણી', 'Downloading Water Reports', onProgress);
  }

  /**
   * Process multipart streaming PDF response with progress tracking.
   * Phase 1: Receive ALL PDFs from the stream (no file downloads during streaming).
   * Phase 2: Download all collected PDFs one by one after stream is complete.
   * This prevents the browser from aborting the fetch connection when download links are clicked.
   */
  private async processStreamingPDFs(
    url: string,
    filePrefix: string,
    progressTitle: string,
    onProgress?: (current: number, total: number, farmerName: string) => void
  ): Promise<void> {
    try {
      this.downloadProgress.start(progressTitle + ' - Generating...', 0);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        }
      });

      if (!response.ok) {
        this.downloadProgress.error(`Server error: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') || '';
      const totalCount = parseInt(response.headers.get('X-Total-Count') || '0', 10);

      // Update progress with actual total
      this.downloadProgress.start(progressTitle + ' - Generating...', totalCount);

      // Extract boundary from Content-Type header
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        this.downloadProgress.error('Invalid response format');
        throw new Error('No boundary found in multipart response');
      }
      const boundary = boundaryMatch[1];

      // ---- Phase 1: Receive all PDFs from server (no downloads yet) ----
      const arrayBuffer = await response.arrayBuffer();
      const collectedPDFs = this.parseMultipartResponse(arrayBuffer, boundary);

      console.log(`[PDF] Received ${collectedPDFs.length}/${totalCount} PDFs from server`);

      if (collectedPDFs.length === 0) {
        this.downloadProgress.error('No PDFs received from server');
        throw new Error('No PDFs received from server');
      }

      // ---- Phase 2: Download all PDFs one by one ----
      this.downloadProgress.start(progressTitle, collectedPDFs.length);

      for (let i = 0; i < collectedPDFs.length; i++) {
        const pdf = collectedPDFs[i];
        const filename = `${filePrefix} - ${pdf.farmerName}.pdf`;

        // Create blob and trigger download
        const buffer = new ArrayBuffer(pdf.data.length);
        new Uint8Array(buffer).set(pdf.data);
        const blob = new Blob([buffer], { type: 'application/pdf' });
        this.downloadPDF(blob, filename);

        // Update progress
        this.downloadProgress.update(i + 1, pdf.farmerName);
        if (onProgress) {
          onProgress(i + 1, collectedPDFs.length, pdf.farmerName);
        }

        // Delay between downloads to avoid browser blocking
        if (i < collectedPDFs.length - 1) {
          await this.delay(500);
        }
      }

      // Mark as completed
      this.downloadProgress.complete();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      this.downloadProgress.error(errorMessage);
      throw error;
    }
  }

  /**
   * Parse multipart response into individual PDF parts
   */
  private parseMultipartResponse(
    arrayBuffer: ArrayBuffer,
    boundary: string
  ): { farmerName: string; data: Uint8Array }[] {
    const uint8Array = new Uint8Array(arrayBuffer);
    const results: { farmerName: string; data: Uint8Array }[] = [];
    const boundaryBytes = new TextEncoder().encode(`--${boundary}`);

    // Find all boundary positions by scanning raw bytes
    const boundaryPositions: number[] = [];
    for (let i = 0; i <= uint8Array.length - boundaryBytes.length; i++) {
      let match = true;
      for (let j = 0; j < boundaryBytes.length; j++) {
        if (uint8Array[i + j] !== boundaryBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        boundaryPositions.push(i);
        i += boundaryBytes.length - 1; // skip past this boundary
      }
    }

    console.log(`[PDF] Found ${boundaryPositions.length} boundaries`);

    // Process each part between consecutive boundaries
    for (let i = 0; i < boundaryPositions.length - 1; i++) {
      const partStart = boundaryPositions[i] + boundaryBytes.length;
      const partEnd = boundaryPositions[i + 1];

      // Find the header/body separator (\r\n\r\n) in this part
      let headerEnd = -1;
      for (let j = partStart; j < partEnd - 3; j++) {
        if (uint8Array[j] === 13 && uint8Array[j+1] === 10 &&
            uint8Array[j+2] === 13 && uint8Array[j+3] === 10) {
          headerEnd = j;
          break;
        }
      }

      if (headerEnd === -1) continue;

      // Parse headers (text portion only)
      const headerText = new TextDecoder().decode(uint8Array.slice(partStart, headerEnd));
      const headers: Record<string, string> = {};
      headerText.split('\r\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          headers[trimmed.substring(0, colonIdx).trim().toLowerCase()] =
            trimmed.substring(colonIdx + 1).trim();
        }
      });

      // Extract binary PDF data (after \r\n\r\n, before next boundary's preceding \r\n)
      const dataStart = headerEnd + 4;
      let dataEnd = partEnd;
      // Trim trailing \r\n before the next boundary
      while (dataEnd > dataStart && (uint8Array[dataEnd - 1] === 10 || uint8Array[dataEnd - 1] === 13)) {
        dataEnd--;
      }

      const data = uint8Array.slice(dataStart, dataEnd);
      if (data.length === 0) continue;

      const farmerName = headers['x-farmer-name']
        ? decodeURIComponent(headers['x-farmer-name'])
        : 'Unknown';

      results.push({ farmerName, data });
    }

    return results;
  }


  /**
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

      throw error;
    }
  }

  // =============== FERTILIZER TESTING PDF METHODS ===============

  /**
   * Stream and download bulk PDFs for a fertilizer testing session
   * Downloads each PDF as it arrives from the server with progress tracking
   */
  async streamBulkFertilizerPDFs(
    sessionId: string,
    onProgress?: (current: number, total: number, farmerName: string) => void
  ): Promise<void> {
    const url = `${environment.apiUrl}/fertilizer-testing/sessions/${sessionId}/pdfs-stream`;
    await this.processStreamingPDFs(url, 'ખાતર ચકાસણી', 'Downloading Fertilizer Reports', onProgress);
  }

  /**
   * Generate and download PDF for a single fertilizer sample
   */
  generateFertilizerSamplePDF(sampleId: string): Observable<Blob> {
    return this.http.post(
      `${environment.apiUrl}/fertilizer-testing/samples/${sampleId}/pdf`,
      {},
      { responseType: 'blob' }
    );
  }

  /**
   * Generate and download all PDFs for a fertilizer testing session (returns base64 encoded PDFs)
   */
  generateBulkFertilizerPDFs(sessionId: string): Observable<BulkPDFResponse> {
    return this.http.post<BulkPDFResponse>(
      `${environment.apiUrl}/fertilizer-testing/sessions/${sessionId}/pdfs`,
      {}
    );
  }

  /**
   * Generate and download combined PDF for all fertilizer samples in a session
   */
  generateCombinedFertilizerPDF(sessionId: string): Observable<Blob> {
    return this.http.post(
      `${environment.apiUrl}/fertilizer-testing/sessions/${sessionId}/pdf-combined`,
      {},
      { responseType: 'blob' }
    );
  }

  /**
   * Download fertilizer sample PDF
   */
  async downloadFertilizerSamplePDF(sampleId: string, filename?: string): Promise<void> {
    try {
      const blob = await this.generateFertilizerSamplePDF(sampleId).toPromise();
      if (blob) {
        const defaultFilename = filename || `ખાતર ચકાસણી - ${new Date().toISOString().split('T')[0]}.pdf`;
        this.downloadPDF(blob, defaultFilename);
      }
    } catch (error) {

      throw error;
    }
  }

  /**
   * Download all fertilizer PDFs for a session (individual downloads with delay)
   */
  async downloadBulkFertilizerPDFs(sessionId: string): Promise<void> {
    try {
      const response = await this.generateBulkFertilizerPDFs(sessionId).toPromise();
      if (response) {
        this.downloadBulkFertilizerPDFsHelper(response);
      }
    } catch (error) {

      throw error;
    }
  }

  /**
   * Download bulk fertilizer PDFs from base64 response
   */
  private downloadBulkFertilizerPDFsHelper(response: BulkPDFResponse): void {
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
          const filename = `ખાતર ચકાસણી - ${farmerName}.pdf`;
          this.downloadPDF(blob, filename);
        }, index * 500); // 500ms delay between downloads
      } catch (error) {

      }
    });
  }

  /**
   * Download combined fertilizer PDF for a session
   */
  async downloadCombinedFertilizerSessionPDF(sessionId: string, filename?: string): Promise<void> {
    try {
      const blob = await this.generateCombinedFertilizerPDF(sessionId).toPromise();
      if (blob) {
        const defaultFilename = filename || `ખાતર ચકાસણી - Combined_${new Date().toISOString().split('T')[0]}.pdf`;
        this.downloadPDF(blob, defaultFilename);
      }
    } catch (error) {

      throw error;
    }
  }
}
