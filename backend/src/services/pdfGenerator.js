const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class PDFGeneratorService {
    constructor() {
        this.soilTemplatePath = path.join(__dirname, '../../templates/soil-report.html');
        this.waterTemplatePath = path.join(__dirname, '../../templates/water-report.html');
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
            '{{sampleId}}': getValue(data._id || ''),

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
            '{{sampleId}}': getValue(data._id || ''),

            // Water measurements (observations)
            '{{phLevel}}': formatNumber(data.ph, 2),
            '{{ecLevel}}': formatNumber(data.ec, 2),
            '{{naLevel}}': formatNumber(data.na, 2),
            '{{caMgLevel}}': formatNumber(data.caMg, 2),
            '{{sarLevel}}': formatNumber(data.sar, 2),
            '{{classification}}': getValue(data.classification),
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
}

// Singleton instance
const pdfGeneratorService = new PDFGeneratorService();

module.exports = pdfGeneratorService;
