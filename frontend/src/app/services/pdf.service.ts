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
    const token = localStorage.getItem('token');
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
   * Process multipart streaming PDF response with progress tracking
   */
  private async processStreamingPDFs(
    url: string,
    filePrefix: string,
    progressTitle: string,
    onProgress?: (current: number, total: number, farmerName: string) => void
  ): Promise<void> {
    try {
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

      // Start progress tracking
      this.downloadProgress.start(progressTitle, totalCount);

      // Extract boundary from Content-Type header
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        this.downloadProgress.error('Invalid response format');
        throw new Error('No boundary found in multipart response');
      }
      const boundary = boundaryMatch[1];

      // Read the response as array buffer and parse multipart
      const arrayBuffer = await response.arrayBuffer();
      const parts = this.parseMultipartResponse(arrayBuffer, boundary);

      // Download each PDF
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const farmerName = part.headers['x-farmer-name']
          ? decodeURIComponent(part.headers['x-farmer-name'])
          : 'Unknown';
        const filename = `${filePrefix} - ${farmerName}.pdf`;

        // Create blob and download
        const buffer = new ArrayBuffer(part.data.length);
        new Uint8Array(buffer).set(part.data);
        const blob = new Blob([buffer], { type: 'application/pdf' });
        this.downloadPDF(blob, filename);

        // Update progress (both service and callback)
        this.downloadProgress.update(i + 1, farmerName);
        if (onProgress) {
          onProgress(i + 1, totalCount || parts.length, farmerName);
        }

        // Small delay between downloads to avoid browser blocking
        if (i < parts.length - 1) {
          await this.delay(100);
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
   * Parse multipart response into individual parts
   */
  private parseMultipartResponse(
    arrayBuffer: ArrayBuffer,
    boundary: string
  ): { headers: Record<string, string>; data: Uint8Array }[] {
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder();
    const parts: { headers: Record<string, string>; data: Uint8Array }[] = [];

    // Convert to string to find boundaries (only for boundary finding, not data)
    const fullText = decoder.decode(uint8Array);
    const boundaryDelimiter = `--${boundary}`;
    const endBoundary = `--${boundary}--`;

    // Find all boundary positions
    let pos = 0;
    const boundaryPositions: number[] = [];

    while (true) {
      const idx = fullText.indexOf(boundaryDelimiter, pos);
      if (idx === -1) break;
      boundaryPositions.push(idx);
      pos = idx + boundaryDelimiter.length;
    }

    // Process each part between boundaries
    for (let i = 0; i < boundaryPositions.length - 1; i++) {
      const partStart = boundaryPositions[i] + boundaryDelimiter.length;
      const partEnd = boundaryPositions[i + 1];

      // Skip the final boundary marker
      const partText = fullText.substring(partStart, partEnd);
      if (partText.trim().startsWith('--')) continue;

      // Find the header/body separator (\r\n\r\n)
      const headerEndIdx = partText.indexOf('\r\n\r\n');
      if (headerEndIdx === -1) continue;

      // Parse headers
      const headerText = partText.substring(0, headerEndIdx);
      const headers: Record<string, string> = {};

      headerText.split('\r\n').forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        const colonIdx = trimmedLine.indexOf(':');
        if (colonIdx > 0) {
          const key = trimmedLine.substring(0, colonIdx).trim().toLowerCase();
          const value = trimmedLine.substring(colonIdx + 1).trim();
          headers[key] = value;
        }
      });

      // Calculate byte offsets for binary data
      const encoder = new TextEncoder();
      const partStartBytes = encoder.encode(fullText.substring(0, partStart)).length;
      const headerBytes = encoder.encode(partText.substring(0, headerEndIdx + 4)).length;
      const dataStartBytes = partStartBytes + headerBytes;

      // Get content length from header or calculate from boundaries
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      let dataEndBytes: number;

      if (contentLength > 0) {
        dataEndBytes = dataStartBytes + contentLength;
      } else {
        // Calculate from next boundary position
        dataEndBytes = encoder.encode(fullText.substring(0, partEnd)).length;
        // Remove trailing \r\n
        while (dataEndBytes > dataStartBytes && (uint8Array[dataEndBytes - 1] === 10 || uint8Array[dataEndBytes - 1] === 13)) {
          dataEndBytes--;
        }
      }

      // Extract binary data
      const data = uint8Array.slice(dataStartBytes, dataEndBytes);

      if (data.length > 0) {
        parts.push({ headers, data });
      }
    }

    return parts;
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
}
