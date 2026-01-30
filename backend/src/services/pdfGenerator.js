const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class PDFGeneratorService {
    constructor() {
        this.soilTemplatePath = path.join(__dirname, '../../templates/soil-report.html');
        this.waterTemplatePath = path.join(__dirname, '../../templates/water-report.html');
        this.receiptTemplatePath = path.join(__dirname, '../../templates/receipt.html');
        this.invoiceTemplatePath = path.join(__dirname, '../../templates/invoice.html');
        this.letterTemplatePath = path.join(__dirname, '../../templates/letter.html');
        this.browser = null;
    }

    /**
     * Initialize browser instance (reusable for multiple PDFs)
     */
    async initBrowser() {
        if (!this.browser) {
            logger.info('Initializing Puppeteer browser');
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
        }
        return this.browser;
    }

    /**
     * Close browser instance
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info('Puppeteer browser closed');
        }
    }

    /**
     * Load and process HTML template
     * @param {string} type - Type of template ('soil' or 'water')
     */
    async loadTemplate(type = 'soil') {
        try {
            const templatePath = type === 'water' ? this.waterTemplatePath : this.soilTemplatePath;
            const template = await fs.readFile(templatePath, 'utf-8');
            return template;
        } catch (error) {
            logger.error(`Failed to load HTML template (${type}): ${error.message}`);
            throw new Error(`PDF template not found for type: ${type}`);
        }
    }

    /**
     * Replace placeholders in HTML template with actual data (Soil)
     */
    fillTemplate(template, data) {
        let html = template;

        // Helper function to format numbers
        const formatNumber = (value, decimals = 2) => {
            if (value === null || value === undefined || value === '') return '';
            return Number(value).toFixed(decimals);
        };

        // Helper function to safely get value
        const getValue = (value) => {
            return value || '';
        };

        // Map all placeholders
        const replacements = {
            '{{farmersName}}': getValue(data.farmersName),
            '{{mobileNo}}': getValue(data.mobileNo),
            '{{location}}': getValue(data.location),
            '{{farmsName}}': getValue(data.farmsName),
            '{{taluka}}': getValue(data.taluka),
            '{{date}}': getValue(data.sessionDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]),
            '{{cropName}}': getValue(data.cropName),
            '{{sampleId}}': getValue(data.sampleNumber || ''),

            // Soil measurements (observations)
            '{{phLevel}}': formatNumber(data.ph, 2),
            '{{ecLevel}}': formatNumber(data.ec, 2),
            '{{ocPercentage}}': formatNumber(data.ocPercent, 2),
            '{{p2o5}}': formatNumber(data.p2o5, 2),
            '{{k2o}}': formatNumber(data.k2o, 2),
            '{{organicMatter}}': formatNumber(data.organicMatter, 2),

            // Classification results (Gujarati)
            '{{phResult}}': getValue(data.phResult),
            '{{ecResult}}': getValue(data.ecResult),
            '{{nitrogenResult}}': getValue(data.nitrogenResult),
            '{{phosphorusResult}}': getValue(data.phosphorusResult),
            '{{potashResult}}': getValue(data.potashResult),
            '{{finalDeduction}}': getValue(data.finalDeduction),
        };

        // Replace all placeholders
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Replace placeholders in HTML template with actual data (Water)
     */
    fillWaterTemplate(template, data) {
        let html = template;

        // Helper function to format numbers
        const formatNumber = (value, decimals = 2) => {
            if (value === null || value === undefined || value === '') return '';
            return Number(value).toFixed(decimals);
        };

        // Helper function to safely get value
        const getValue = (value) => {
            return value || '';
        };

        // Map all placeholders for water testing
        const replacements = {
            '{{farmersName}}': getValue(data.farmersName),
            '{{mobileNo}}': getValue(data.mobileNo),
            '{{location}}': getValue(data.location),
            '{{farmsName}}': getValue(data.farmsName),
            '{{taluka}}': getValue(data.taluka),
            '{{date}}': getValue(data.sessionDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]),
            '{{boreWellType}}': getValue(data.boreWellType),
            '{{sampleId}}': getValue(data.sampleNumber || ''),

            // Water measurements (observations)
            '{{phLevel}}': formatNumber(data.ph, 2),
            '{{ecLevel}}': formatNumber(data.ec, 2),
            '{{naLevel}}': formatNumber(data.na, 2),
            '{{caMgLevel}}': formatNumber(data.caMg, 2),
            '{{sarLevel}}': formatNumber(data.sar, 2),
            '{{waterClass}}': getValue(data.waterClass),
            '{{co3Hco3Level}}': formatNumber(data.co3Hco3, 2),
            '{{rscLevel}}': formatNumber(data.rsc, 2),

            // Classification results (Gujarati)
            '{{phResult}}': getValue(data.phResult),
            '{{ecResult}}': getValue(data.ecResult),
            '{{sarResult}}': getValue(data.sarResult),
            '{{rscResult}}': getValue(data.rscResult),
            '{{finalDeduction}}': getValue(data.finalDeduction)
        };

        // Replace all placeholders
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Generate a single PDF from sample data
     */
    async generateSinglePDF(sampleData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating PDF for sample: ${sampleData._id || 'unknown'}`);

            // Load and fill template
            const template = await this.loadTemplate();
            const html = this.fillTemplate(template, sampleData);

            // Set content and wait for fonts to load
            await page.setContent(html, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            // Add Google Fonts for Gujarati support
            await page.addStyleTag({
                content: `
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
        `
            });

            // Wait a bit for fonts to load
            await new Promise(resolve => setTimeout(resolve, 500));

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0mm',
                    right: '0mm',
                    bottom: '0mm',
                    left: '0mm'
                }
            });

            logger.info(`PDF generated successfully for sample: ${sampleData._id || 'unknown'}`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating PDF: ${error.message}`, {stack: error.stack});
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Generate multiple PDFs (bulk generation)
     */
    async generateBulkPDFs(samplesArray) {
        const browser = await this.initBrowser();
        const pdfs = [];

        try {
            logger.info(`Generating ${samplesArray.length} PDFs in bulk`);

            for (let i = 0; i < samplesArray.length; i++) {
                const sample = samplesArray[i];
                const page = await browser.newPage();

                try {
                    const template = await this.loadTemplate();
                    const html = this.fillTemplate(template, sample);

                    await page.setContent(html, {
                        waitUntil: ['networkidle0', 'domcontentloaded']
                    });

                    await page.addStyleTag({
                        content: `
              @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
            `
                    });

                    await new Promise(resolve => setTimeout(resolve, 500));

                    const pdfBuffer = await page.pdf({
                        format: 'A4',
                        printBackground: true,
                        margin: {
                            top: '0mm',
                            right: '0mm',
                            bottom: '0mm',
                            left: '0mm'
                        }
                    });

                    pdfs.push({
                        sampleId: sample._id,
                        farmerName: sample.farmersName,
                        buffer: pdfBuffer
                    });

                    logger.debug(`Generated PDF ${i + 1}/${samplesArray.length}`);

                } finally {
                    await page.close();
                }
            }

            logger.info(`Successfully generated ${pdfs.length} PDFs`);
            return pdfs;

        } catch (error) {
            logger.error(`Error in bulk PDF generation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate a combined PDF with multiple samples
     */
    async generateCombinedPDF(samplesArray) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating combined PDF with ${samplesArray.length} samples`);

            // Create HTML with multiple pages
            const template = await this.loadTemplate();
            let combinedHtml = '';

            samplesArray.forEach((sample, index) => {
                const pageHtml = this.fillTemplate(template, sample);
                // Add page break after each report except the last one
                if (index < samplesArray.length - 1) {
                    combinedHtml += pageHtml.replace('</body>', '<div style="page-break-after: always;"></div></body>');
                } else {
                    combinedHtml += pageHtml;
                }
            });

            await page.setContent(combinedHtml, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            await page.addStyleTag({
                content: `
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
        `
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0mm',
                    right: '0mm',
                    bottom: '0mm',
                    left: '0mm'
                }
            });

            logger.info(`Combined PDF generated successfully with ${samplesArray.length} samples`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating combined PDF: ${error.message}`);
            throw error;
        } finally {
            await page.close();
        }
    }

    // ============ WATER TESTING PDF METHODS ============

    /**
     * Generate a single PDF from water sample data
     */
    async generateWaterPDF(sampleData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating water PDF for sample: ${sampleData._id || 'unknown'}`);

            // Load and fill water template
            const template = await this.loadTemplate('water');
            const html = this.fillWaterTemplate(template, sampleData);

            // Set content and wait for fonts to load
            await page.setContent(html, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            // Add Google Fonts for Gujarati support
            await page.addStyleTag({
                content: `
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
        `
            });

            // Wait a bit for fonts to load
            await new Promise(resolve => setTimeout(resolve, 500));

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0mm',
                    right: '0mm',
                    bottom: '0mm',
                    left: '0mm'
                }
            });

            logger.info(`Water PDF generated successfully for sample: ${sampleData._id || 'unknown'}`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating water PDF: ${error.message}`, {stack: error.stack});
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Generate multiple water PDFs (bulk generation)
     */
    async generateBulkWaterPDFs(samplesArray) {
        const browser = await this.initBrowser();
        const pdfs = [];

        try {
            logger.info(`Generating ${samplesArray.length} water PDFs in bulk`);

            for (let i = 0; i < samplesArray.length; i++) {
                const sample = samplesArray[i];
                const page = await browser.newPage();

                try {
                    const template = await this.loadTemplate('water');
                    const html = this.fillWaterTemplate(template, sample);

                    await page.setContent(html, {
                        waitUntil: ['networkidle0', 'domcontentloaded']
                    });

                    await page.addStyleTag({
                        content: `
              @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
            `
                    });

                    await new Promise(resolve => setTimeout(resolve, 500));

                    const pdfBuffer = await page.pdf({
                        format: 'A4',
                        printBackground: true,
                        margin: {
                            top: '0mm',
                            right: '0mm',
                            bottom: '0mm',
                            left: '0mm'
                        }
                    });

                    pdfs.push({
                        sampleId: sample._id,
                        farmerName: sample.farmersName,
                        buffer: pdfBuffer
                    });

                    logger.debug(`Generated water PDF ${i + 1}/${samplesArray.length}`);

                } finally {
                    await page.close();
                }
            }

            logger.info(`Successfully generated ${pdfs.length} water PDFs`);
            return pdfs;

        } catch (error) {
            logger.error(`Error in bulk water PDF generation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate a combined PDF with multiple water samples
     */
    async generateCombinedWaterPDF(samplesArray) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating combined water PDF with ${samplesArray.length} samples`);

            // Create HTML with multiple pages
            const template = await this.loadTemplate('water');
            let combinedHtml = '';

            samplesArray.forEach((sample, index) => {
                const pageHtml = this.fillWaterTemplate(template, sample);
                // Add page break after each report except the last one
                if (index < samplesArray.length - 1) {
                    combinedHtml += pageHtml.replace('</body>', '<div style="page-break-after: always;"></div></body>');
                } else {
                    combinedHtml += pageHtml;
                }
            });

            await page.setContent(combinedHtml, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            await page.addStyleTag({
                content: `
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
        `
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0mm',
                    right: '0mm',
                    bottom: '0mm',
                    left: '0mm'
                }
            });

            logger.info(`Combined water PDF generated successfully with ${samplesArray.length} samples`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating combined water PDF: ${error.message}`);
            throw error;
        } finally {
            await page.close();
        }
    }

    // ============ MANAGERIAL WORK PDF METHODS ============

    /**
     * Generate Receipt PDF
     */
    async generateReceiptPDF(receiptData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating receipt PDF for: ${receiptData.receiptNumber || 'unknown'}`);

            const template = await fs.readFile(this.receiptTemplatePath, 'utf-8');
            const html = this.fillReceiptTemplate(template, receiptData);

            await page.setContent(html, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            await page.addStyleTag({
                content: `
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
                `
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // Get the actual receipt width (let height adapt naturally)
            const width = await page.evaluate(() => {
                const receiptOuter = document.querySelector('.receipt-outer');
                if (receiptOuter) {
                    const rect = receiptOuter.getBoundingClientRect();
                    return rect.width + 40;  // 20px padding on each side
                }
                // Fallback to body width
                return document.body.scrollWidth;
            });

            logger.info(`Receipt width: ${width}px (height will adapt to content)`);

            const pdfBuffer = await page.pdf({
                width: `${width}px`,
                // No height specified - let it adapt to content
                printBackground: true,
                preferCSSPageSize: false,  // Ignore @page CSS rules
                margin: {
                    top: '20px',
                    right: '0px',
                    bottom: '20px',
                    left: '0px'
                }
            });

            logger.info(`Receipt PDF generated successfully for: ${receiptData.receiptNumber}`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating receipt PDF: ${error.message}`, {stack: error.stack});
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Fill Receipt Template
     */
    fillReceiptTemplate(template, data) {
        const formatDate = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        const formatCurrency = (amount) => {
            if (amount === null || amount === undefined) return '';
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
            }).format(amount);
        };

        const paymentMethodLabels = {
            'cheque': 'Cheque/D.D.',
            'bank_transfer': 'Bank Transfer',
            'cash': 'Cash'
        };

        const paymentTypeLabels = {
            'full_payment': 'Full Payment',
            'part_payment': 'Part Payment',
            'advance_payment': 'Advance Payment'
        };

        const replacements = {
            '{{receiptNumber}}': data.receiptNumber || '',
            '{{receiptDate}}': formatDate(data.date),
            '{{customerName}}': data.customerName || '',
            '{{customerAddress}}': data.customerAddress || '',
            '{{amount}}': formatCurrency(data.amount),
            '{{amountInWords}}': data.amountInWords || '',
            '{{paymentMethod}}': paymentMethodLabels[data.paymentMethod] || data.paymentMethod || '',
            '{{chequeNumber}}': data.chequeNumber || '',
            '{{bankName}}': data.bankName || '',
            '{{paymentType}}': paymentTypeLabels[data.paymentType] || data.paymentType || '',
            '{{billNumber}}': data.billReference || '',
            '{{billDate}}': formatDate(data.billDate) || '',
            '{{remarks}}': data.remarks || ''
        };

        let html = template;
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Generate Invoice PDF
     */
    async generateInvoicePDF(invoiceData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating invoice PDF for: ${invoiceData.invoiceNumber || 'unknown'}`);

            const template = await fs.readFile(this.invoiceTemplatePath, 'utf-8');
            const html = this.fillInvoiceTemplate(template, invoiceData);

            await page.setContent(html, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            // Add both English and Gujarati fonts
            await page.addStyleTag({
                content: `
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;700&display=swap');
                `
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '10mm',
                    right: '10mm',
                    bottom: '10mm',
                    left: '10mm'
                }
            });

            logger.info(`Invoice PDF generated successfully for: ${invoiceData.invoiceNumber}`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating invoice PDF: ${error.message}`, {stack: error.stack});
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Fill Invoice Template
     */
    fillInvoiceTemplate(template, data) {
        const formatDate = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        const formatCurrency = (amount) => {
            if (amount === null || amount === undefined) return '';
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
            }).format(amount);
        };

        // Generate line items table rows
        const itemsRows = (data.items || []).map(item => `
            <tr>
                <td>${item.serialNumber}</td>
                <td>${item.descriptionGujarati ? '<span class="gujarati">' + item.descriptionGujarati + '</span>' : ''}<br/><span>${item.description}<span></td>
                <td>${formatCurrency(item.rate)}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.total)}</td>
            </tr>
        `).join('') + `
            <tr style="border-top: 2px solid #000; font-weight: bold;">
                <td></td>
                <td colspan="2" style="text-align: right; font-style: italic; font-size: 11px; font-weight: normal;">
                    ${data.grandTotalInWords || ''}
                </td>
                <td class="gujarati" style="text-align: center;">કુલ રુ.</td>
                <td style="text-align: right;">${formatCurrency(data.grandTotal)}</td>
            </tr>
        `;

        // Map invoice type to Gujarati label
        const invoiceTypeLabels = {
            'cash': 'કેશ મેમો',
            'debit_memo': 'ડેબીટ મેમો'
        };
        const invoiceTypeLabel = invoiceTypeLabels[data.invoiceType] || 'કેશ મેમો';

        const replacements = {
            '{{invoiceNumber}}': data.invoiceNumber || '',
            '{{invoiceType}}': invoiceTypeLabel,
            '{{date}}': formatDate(data.date),
            '{{customerName}}': data.customerName || '',
            '{{referenceNumber}}': data.referenceNumber || '',
            '{{location}}': data.location || '',
            '{{village}}': data.village || '',
            '{{phoneNumber}}': data.phoneNumber || '',
            '{{mobileNumber}}': data.mobileNumber || '',
            '{{itemsRows}}': itemsRows,
            '{{subtotal}}': formatCurrency(data.subtotal),
            '{{taxAmount}}': formatCurrency(data.taxAmount || 0),
            '{{discount}}': formatCurrency(data.discount || 0),
            '{{grandTotal}}': formatCurrency(data.grandTotal),
            '{{grandTotalInWords}}': data.grandTotalInWords || '',
            '{{consultantName}}': data.consultantName || 'અનિલકુમાર હદવાણી',
            '{{consultantCredentials}}': data.consultantCredentials || 'M.Sc. (Agri.)'
        };

        let html = template;
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Generate Letter PDF
     */
    async generateLetterPDF(letterData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating letter PDF for: ${letterData.letterNumber || 'unknown'}`);

            const template = await fs.readFile(this.letterTemplatePath, 'utf-8');
            const html = this.fillLetterTemplate(template, letterData);

            await page.setContent(html, {
                waitUntil: ['networkidle0', 'domcontentloaded']
            });

            await page.addStyleTag({
                content: `
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
                `
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });

            logger.info(`Letter PDF generated successfully for: ${letterData.letterNumber}`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating letter PDF: ${error.message}`, {stack: error.stack});
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Fill Letter Template
     */
    fillLetterTemplate(template, data) {
        const formatDate = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        };

        const replacements = {
            '{{letterNumber}}': data.letterNumber || '',
            '{{date}}': formatDate(data.date),
            '{{companyName}}': data.companyName || 'SHIV AGRI CONSULTANCY AND LABORATORY',
            '{{consultantName}}': data.consultantName || 'MR. ANILKUMAR HADVANI',
            '{{consultantCredentials}}': data.consultantCredentials || 'M.Sc. (Agri.)',
            '{{consultantTitle}}': data.consultantTitle || 'Agricultural Consultant',
            '{{contactPhone}}': data.contactPhone || '97234 56866 / 92655 08385',
            '{{contactEmail}}': data.contactEmail || 'anihadvani@yahoo.com',
            '{{companyAddress}}': data.companyAddress || '306, Nine Square, Golden City-1, Nr. Zanzarda Chokadi, Junagadh (Guj.)',
            '{{recipientName}}': data.recipientName || '',
            '{{recipientAddress}}': data.recipientAddress || '',
            '{{subject}}': data.subject || '',
            '{{content}}': data.content || ''
        };

        let html = template;
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }
}

// Singleton instance
const pdfGeneratorService = new PDFGeneratorService();

module.exports = pdfGeneratorService;
