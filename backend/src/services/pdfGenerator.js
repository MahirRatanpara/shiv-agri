const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Concurrency limit for parallel PDF generation
const MAX_CONCURRENT_PDFS = 5;

class PDFGeneratorService {
    constructor() {
        this.soilTemplatePath = path.join(__dirname, '../../templates/soil-report.html');
        this.waterTemplatePath = path.join(__dirname, '../../templates/water-report.html');
        this.receiptTemplatePath = path.join(__dirname, '../../templates/receipt.html');
        this.invoiceTemplatePath = path.join(__dirname, '../../templates/invoice.html');
        this.letterTemplatePath = path.join(__dirname, '../../templates/letter.html');
        this.browser = null;

        // Template cache for faster access
        this.templateCache = {};

        // Font CSS to inject (cached)
        this.fontCSS = `
            @font-face {
                font-family: 'Noto Sans Gujarati';
                src: url('https://fonts.gstatic.com/s/notosansgujarati/v25/wlpWgx_HC1ti5ViekvcxnhMlCVo3f5pv17ivlzsUB14gg1TMR21M-Wp73A.woff2') format('woff2');
                font-weight: 400;
                font-style: normal;
                font-display: swap;
            }
            @font-face {
                font-family: 'Noto Sans Gujarati';
                src: url('https://fonts.gstatic.com/s/notosansgujarati/v25/wlpWgx_HC1ti5ViekvcxnhMlCVo3f5pv17ivlzsUB14gg1TMR21M-Wp73A.woff2') format('woff2');
                font-weight: 700;
                font-style: normal;
                font-display: swap;
            }
        `;
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
                    '--disable-gpu',
                    '--disable-web-security',
                    '--font-render-hinting=none'
                ]
            });

            // Pre-cache templates
            await this.preloadTemplates();
        }
        return this.browser;
    }

    /**
     * Pre-load templates into memory cache
     */
    async preloadTemplates() {
        try {
            logger.info('Pre-loading PDF templates into cache');
            this.templateCache.soil = await fs.readFile(this.soilTemplatePath, 'utf-8');
            this.templateCache.water = await fs.readFile(this.waterTemplatePath, 'utf-8');

            // Try to load optional templates
            try {
                this.templateCache.receipt = await fs.readFile(this.receiptTemplatePath, 'utf-8');
            } catch (e) { /* optional */ }
            try {
                this.templateCache.invoice = await fs.readFile(this.invoiceTemplatePath, 'utf-8');
            } catch (e) { /* optional */ }
            try {
                this.templateCache.letter = await fs.readFile(this.letterTemplatePath, 'utf-8');
            } catch (e) { /* optional */ }

            logger.info('Templates pre-loaded successfully');
        } catch (error) {
            logger.error(`Failed to preload templates: ${error.message}`);
        }
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
     * Load and process HTML template (uses cache if available)
     * @param {string} type - Type of template ('soil' or 'water')
     */
    async loadTemplate(type = 'soil') {
        // Return from cache if available
        if (this.templateCache[type]) {
            return this.templateCache[type];
        }

        try {
            const templatePath = type === 'water' ? this.waterTemplatePath : this.soilTemplatePath;
            const template = await fs.readFile(templatePath, 'utf-8');
            this.templateCache[type] = template;
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
     * Generate a single PDF from sample data (optimized)
     */
    async generateSinglePDF(sampleData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating PDF for sample: ${sampleData._id || 'unknown'}`);

            // Load and fill template
            const template = await this.loadTemplate();
            const html = this.fillTemplate(template, sampleData);

            // Inject font CSS directly into HTML to avoid network request
            const htmlWithFonts = html.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            // Set content with optimized wait conditions
            await page.setContent(htmlWithFonts, {
                waitUntil: 'domcontentloaded'
            });

            // Reduced wait for font rendering (100ms instead of 500ms)
            await new Promise(resolve => setTimeout(resolve, 100));

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
     * Generate a single PDF quickly (used in parallel generation)
     * @private
     */
    async _generateSinglePDFOptimized(browser, sample, type = 'soil') {
        const page = await browser.newPage();

        try {
            const template = await this.loadTemplate(type);
            const html = type === 'water'
                ? this.fillWaterTemplate(template, sample)
                : this.fillTemplate(template, sample);

            // Inject font CSS directly
            const htmlWithFonts = html.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(htmlWithFonts, {
                waitUntil: 'domcontentloaded'
            });

            // Minimal wait for font rendering
            await new Promise(resolve => setTimeout(resolve, 50));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
            });

            return {
                sampleId: sample._id,
                farmerName: sample.farmersName,
                buffer: pdfBuffer
            };
        } finally {
            await page.close();
        }
    }

    /**
     * Process samples in chunks with concurrency control
     * @private
     */
    async _processInParallel(samples, type, concurrency = MAX_CONCURRENT_PDFS) {
        const browser = await this.initBrowser();
        const results = [];

        // Process in chunks
        for (let i = 0; i < samples.length; i += concurrency) {
            const chunk = samples.slice(i, i + concurrency);
            const chunkPromises = chunk.map(sample =>
                this._generateSinglePDFOptimized(browser, sample, type)
            );

            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);

            logger.debug(`Generated PDFs ${i + 1}-${Math.min(i + concurrency, samples.length)}/${samples.length}`);
        }

        return results;
    }

    /**
     * Generate multiple PDFs in parallel (optimized bulk generation)
     */
    async generateBulkPDFs(samplesArray) {
        try {
            logger.info(`Generating ${samplesArray.length} PDFs in parallel (concurrency: ${MAX_CONCURRENT_PDFS})`);
            const startTime = Date.now();

            const results = await this._processInParallel(samplesArray, 'soil');

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info(`Successfully generated ${results.length} PDFs in ${duration}s`);

            return results;
        } catch (error) {
            logger.error(`Error in bulk PDF generation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate PDFs with streaming support - yields each PDF as it's generated
     * Uses smaller batch size (2) to keep data flowing and prevent timeouts
     * @param {Array} samplesArray - Array of sample data
     * @param {string} type - 'soil' or 'water'
     * @param {Function} onProgress - Callback called with each PDF: (pdf, index, total)
     */
    async *generateBulkPDFsStream(samplesArray, type = 'soil', onProgress = null) {
        const browser = await this.initBrowser();
        const total = samplesArray.length;
        const STREAM_CONCURRENCY = MAX_CONCURRENT_PDFS;

        logger.info(`Starting streaming PDF generation for ${total} samples (type: ${type}, concurrency: ${STREAM_CONCURRENCY})`);
        const startTime = Date.now();

        // Process in smaller parallel chunks to keep data flowing
        for (let i = 0; i < samplesArray.length; i += STREAM_CONCURRENCY) {
            const chunk = samplesArray.slice(i, i + STREAM_CONCURRENCY);
            const batchNum = Math.floor(i/STREAM_CONCURRENCY) + 1;
            const totalBatches = Math.ceil(total/STREAM_CONCURRENCY);

            logger.info(`Starting batch ${batchNum}/${totalBatches}: PDFs ${i + 1}-${Math.min(i + STREAM_CONCURRENCY, total)}`);

            const chunkPromises = chunk.map((sample, idx) =>
                this._generateSinglePDFOptimized(browser, sample, type)
                    .then(result => ({ ...result, index: i + idx }))
                    .catch(error => {
                        logger.error(`Error generating PDF for sample ${i + idx}: ${error.message}`);
                        return null;
                    })
            );

            // Wait for all in chunk to complete
            const chunkResults = await Promise.all(chunkPromises);

            // Yield each result (skip nulls from errors)
            for (const result of chunkResults) {
                if (!result) continue;

                if (onProgress) {
                    onProgress(result, result.index, total);
                }
                logger.info(`Generated and yielding PDF ${result.index + 1}/${total}`);
                yield result;
            }

            logger.info(`Completed batch ${batchNum}/${totalBatches}`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`Streaming PDF generation completed in ${duration}s`);
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

            // Inject font CSS
            combinedHtml = combinedHtml.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(combinedHtml, {
                waitUntil: 'domcontentloaded'
            });

            await new Promise(resolve => setTimeout(resolve, 200));

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

            // Inject font CSS directly
            const htmlWithFonts = html.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(htmlWithFonts, {
                waitUntil: 'domcontentloaded'
            });

            // Reduced wait
            await new Promise(resolve => setTimeout(resolve, 100));

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
     * Generate multiple water PDFs in parallel (optimized)
     */
    async generateBulkWaterPDFs(samplesArray) {
        try {
            logger.info(`Generating ${samplesArray.length} water PDFs in parallel (concurrency: ${MAX_CONCURRENT_PDFS})`);
            const startTime = Date.now();

            const results = await this._processInParallel(samplesArray, 'water');

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info(`Successfully generated ${results.length} water PDFs in ${duration}s`);

            return results;
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

            // Inject font CSS
            combinedHtml = combinedHtml.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(combinedHtml, {
                waitUntil: 'domcontentloaded'
            });

            await new Promise(resolve => setTimeout(resolve, 200));

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

            const template = this.templateCache.receipt || await fs.readFile(this.receiptTemplatePath, 'utf-8');
            const html = this.fillReceiptTemplate(template, receiptData);

            await page.setContent(html, {
                waitUntil: 'domcontentloaded'
            });

            await page.addStyleTag({
                content: `
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
                `
            });

            await new Promise(resolve => setTimeout(resolve, 200));

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

            const template = this.templateCache.invoice || await fs.readFile(this.invoiceTemplatePath, 'utf-8');
            const html = this.fillInvoiceTemplate(template, invoiceData);

            // Inject font CSS
            const htmlWithFonts = html.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(htmlWithFonts, {
                waitUntil: 'domcontentloaded'
            });

            await new Promise(resolve => setTimeout(resolve, 200));

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

            const template = this.templateCache.letter || await fs.readFile(this.letterTemplatePath, 'utf-8');
            const html = this.fillLetterTemplate(template, letterData);

            await page.setContent(html, {
                waitUntil: 'domcontentloaded'
            });

            await page.addStyleTag({
                content: `
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
                `
            });

            await new Promise(resolve => setTimeout(resolve, 200));

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
