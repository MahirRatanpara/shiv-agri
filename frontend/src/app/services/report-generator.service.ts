import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { SoilTestingData } from './soil-testing.service';

export interface ReportData extends SoilTestingData {
  sessionDate?: string;
  reportDate?: string;
  sessionVersion?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ReportGeneratorService {
  private templatePath = '/assets/templates/soil-report-template.pdf';

  constructor() {}

  /**
   * Generate and download a single PDF report
   */
  async generateSingleReport(data: ReportData, downloadFileName?: string): Promise<void> {
    try {
      const pdfBytes = await this.fillPdfTemplate(data);
      const fileName = downloadFileName || this.generateFileName(data);
      this.downloadPdf(pdfBytes, fileName);
    } catch (error) {
      console.error('Error generating PDF report:', error);
      throw new Error('Failed to generate PDF report. Please check the template and data.');
    }
  }

  /**
   * Generate and download multiple PDF reports (one file per record)
   */
  async generateBulkReports(
    dataArray: ReportData[],
    sessionDate?: string,
    sessionVersion?: number
  ): Promise<void> {
    if (dataArray.length === 0) {
      throw new Error('No data available to generate reports');
    }

    try {
      for (let i = 0; i < dataArray.length; i++) {
        const data = {
          ...dataArray[i],
          sessionDate: sessionDate || new Date().toISOString().split('T')[0],
          reportDate: new Date().toISOString().split('T')[0],
          sessionVersion
        };

        const pdfBytes = await this.fillPdfTemplate(data);
        const fileName = this.generateFileName(data, i + 1);

        // Add delay between downloads to avoid browser blocking
        if (i > 0) {
          await this.delay(500);
        }

        this.downloadPdf(pdfBytes, fileName);
      }
    } catch (error) {
      console.error('Error generating bulk reports:', error);
      throw new Error('Failed to generate bulk reports. Some reports may not have been downloaded.');
    }
  }

  /**
   * Generate a combined PDF with all reports in one file
   */
  async generateCombinedReport(
    dataArray: ReportData[],
    sessionDate?: string,
    sessionVersion?: number
  ): Promise<void> {
    if (dataArray.length === 0) {
      throw new Error('No data available to generate reports');
    }

    try {
      const combinedPdf = await PDFDocument.create();

      for (const record of dataArray) {
        const data = {
          ...record,
          sessionDate: sessionDate || new Date().toISOString().split('T')[0],
          reportDate: new Date().toISOString().split('T')[0],
          sessionVersion
        };

        const pdfBytes = await this.fillPdfTemplate(data);
        const pdf = await PDFDocument.load(pdfBytes);
        const pages = await combinedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => combinedPdf.addPage(page));
      }

      const combinedPdfBytes = await combinedPdf.save();
      const fileName = `Soil_Reports_Combined_${sessionDate || 'session'}_v${sessionVersion || 1}.pdf`;
      this.downloadPdf(combinedPdfBytes, fileName);
    } catch (error) {
      console.error('Error generating combined report:', error);
      throw new Error('Failed to generate combined PDF report.');
    }
  }

  /**
   * Preview a single report in a new browser tab
   */
  async previewReport(data: ReportData): Promise<void> {
    try {
      const pdfBytes = await this.fillPdfTemplate(data);
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing PDF report:', error);
      throw new Error('Failed to preview PDF report.');
    }
  }

  /**
   * List all form fields in the template (for debugging)
   */
  async listFormFields(): Promise<string[]> {
    try {
      const templateBytes = await this.loadTemplate();
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      return fields.map(field => field.getName());
    } catch (error) {
      console.error('Error listing form fields:', error);
      throw new Error('Failed to load PDF template or read form fields.');
    }
  }

  /**
   * Core method: Fill PDF template with data
   */
  private async fillPdfTemplate(data: ReportData): Promise<Uint8Array> {
    const templateBytes = await this.loadTemplate();
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Map data to form fields
    const fieldMapping: { [key: string]: string } = {
      sampleId: data._id || '',  // Add sampleId (MongoDB _id)
      date: data.sessionDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],  // Add date
      farmerName: data.farmersName || '',
      mobileNumber: data.mobileNo || '',
      location: data.location || '',
      farmName: data.farmsName || '',
      taluka: data.taluka || '',
      phLevel: this.formatNumber(data.ph),
      ecLevel: this.formatNumber(data.ec),
      ocBlank: this.formatNumber(data.ocBlank, 4),
      ocStart: this.formatNumber(data.ocStart, 4),
      ocEnd: this.formatNumber(data.ocEnd, 4),
      p2o5R: this.formatNumber(data.p2o5R, 2),
      k2oR: this.formatNumber(data.k2oR, 2),
      ocDifference: this.formatNumber(data.ocDifference, 4),
      ocPercentage: this.formatNumber(data.ocPercent, 2),
      p2o5: this.formatNumber(data.p2o5, 2),
      k2o: this.formatNumber(data.k2o, 2),
      organicMatter: this.formatNumber(data.organicMatter, 2),
      cropName: data.cropName || '',
      finalDeduction: data.finalDeduction || '',
      sessionDate: data.sessionDate || '',
      reportDate: data.reportDate || new Date().toISOString().split('T')[0],

      // Classification fields (Gujarati)
      phClassification: data.phClassification || '',
      phLabel: data.phLabel || '',
      ecClassification: data.ecClassification || '',
      ecLabel: data.ecLabel || '',
      nitrogenClassification: data.nitrogenClassification || '',
      nitrogenLabel: data.nitrogenLabel || '',
      phosphorusClassification: data.phosphorusClassification || '',
      phosphorusLabel: data.phosphorusLabel || '',
      potashClassification: data.potashClassification || '',
      potashLabel: data.potashLabel || '',

      // Classification fields (English)
      phClassificationEn: data.phClassificationEn || '',
      phLabelEn: data.phLabelEn || '',
      ecClassificationEn: data.ecClassificationEn || '',
      ecLabelEn: data.ecLabelEn || '',
      nitrogenClassificationEn: data.nitrogenClassificationEn || '',
      nitrogenLabelEn: data.nitrogenLabelEn || '',
      phosphorusClassificationEn: data.phosphorusClassificationEn || '',
      phosphorusLabelEn: data.phosphorusLabelEn || '',
      potashClassificationEn: data.potashClassificationEn || '',
      potashLabelEn: data.potashLabelEn || ''
    };

    // Fill each field
    Object.entries(fieldMapping).forEach(([fieldName, value]) => {
      try {
        const field = form.getTextField(fieldName);
        field.setText(value);
      } catch (error) {
        console.warn(`Field "${fieldName}" not found in PDF template`);
      }
    });

    // Flatten form to make it non-editable
    form.flatten();

    return await pdfDoc.save();
  }

  /**
   * Load PDF template from assets
   */
  private async loadTemplate(): Promise<ArrayBuffer> {
    const response = await fetch(this.templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load PDF template from ${this.templatePath}`);
    }
    return await response.arrayBuffer();
  }

  /**
   * Format numbers with proper decimal places
   */
  private formatNumber(value: number | null | undefined, decimals: number = 2): string {
    if (value === null || value === undefined) {
      return '';
    }
    return value.toFixed(decimals);
  }

  /**
   * Generate filename for the PDF
   */
  private generateFileName(data: ReportData, index?: number): string {
    const farmerName = data.farmersName?.replace(/\s+/g, '_') || 'Unknown';
    const date = new Date().toISOString().split('T')[0];
    const indexSuffix = index ? `_${index}` : '';
    return `Soil_Report_${farmerName}_${date}${indexSuffix}.pdf`;
  }

  /**
   * Download PDF file
   */
  private downloadPdf(pdfBytes: Uint8Array, fileName: string): void {
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    saveAs(blob, fileName);
  }

  /**
   * Utility to add delay between downloads
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
