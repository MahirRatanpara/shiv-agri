const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Concurrency limit for parallel PDF generation
const MAX_CONCURRENT_PDFS = 5;

class PDFGeneratorService {
    constructor() {
        this.soilTemplatePath = path.join(__dirname, '../../templates/soil-report.html');
        this.waterTemplatePath = path.join(__dirname, '../../templates/water-report.html');
        this.fertilizerNormalTemplatePath = path.join(__dirname, '../../templates/normal-fertilizer-report.html');
        this.fertilizerSmallFruitTemplatePath = path.join(__dirname, '../../templates/small-fruit-tree-report-simple.html');
        this.fertilizerLargeFruitTemplatePath = path.join(__dirname, '../../templates/large-fruit-crop-report.html');
        this.receiptTemplatePath = path.join(__dirname, '../../templates/receipt.html');
        this.invoiceTemplatePath = path.join(__dirname, '../../templates/invoice.html');
        this.letterTemplatePath = path.join(__dirname, '../../templates/letter.html');
        this.prescriptionTemplatePath = path.join(__dirname, '../../templates/prescription.html');
        this.browser = null;

        // Template cache for faster access
        this.templateCache = {};

        // Load Gujarati font as base64 data URI (works offline in Docker)
        const fontPath = path.join(__dirname, '../../fonts/NotoSansGujarati-Regular.ttf');
        let fontDataUri;
        try {
            const fontBuffer = fsSync.readFileSync(fontPath);
            fontDataUri = `data:font/truetype;base64,${fontBuffer.toString('base64')}`;
            logger.info('Loaded NotoSansGujarati font from local file');
        } catch (err) {
            logger.warn(`Could not load local font file: ${err.message}, falling back to Google Fonts URL`);
            fontDataUri = 'https://fonts.gstatic.com/s/notosansgujarati/v25/wlpWgx_HC1ti5ViekvcxnhMlCVo3f5pv17ivlzsUB14gg1TMR21M-Wp73A.woff2';
        }

        // Font CSS to inject (cached)
        this.fontCSS = `
            @font-face {
                font-family: 'Noto Sans Gujarati';
                src: url('${fontDataUri}') format('truetype');
                font-weight: 400;
                font-style: normal;
                font-display: block;
            }
            @font-face {
                font-family: 'Noto Sans Gujarati';
                src: url('${fontDataUri}') format('truetype');
                font-weight: 700;
                font-style: normal;
                font-display: block;
            }
        `;
    }

    /**
     * Initialize browser instance (reusable for multiple PDFs).
     *
     * The cached browser can become dead between requests (OOM kill, manual
     * Chrome crash, container restart) but the in-memory reference is still
     * non-null. Calling `newPage()` on a dead browser surfaces as
     * "Connection closed" / "Protocol error". We now verify liveness on
     * every entry and re-launch if needed.
     */
    async initBrowser() {
        const isAlive = this.browser
            && (typeof this.browser.connected === 'boolean'
                ? this.browser.connected
                : (typeof this.browser.isConnected === 'function' ? this.browser.isConnected() : true));

        if (this.browser && !isAlive) {
            logger.warn('Cached Puppeteer browser is disconnected — discarding and relaunching');
            try { await this.browser.close(); } catch (_) { /* already dead */ }
            this.browser = null;
        }

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

            // If the browser dies later (process killed, crash, etc.), null
            // the cache so the next request relaunches a fresh instance
            // instead of trying to talk to a dead CDP socket.
            this.browser.on('disconnected', () => {
                logger.warn('Puppeteer browser disconnected — cache cleared');
                this.browser = null;
            });

            // Pre-cache templates
            await this.preloadTemplates();
        }
        return this.browser;
    }

    /**
     * Wrapper that retries a page-based PDF render once when the cached
     * browser turns out to be dead mid-render. Used by single-PDF flows
     * (receipt, invoice, letter, quotation, prescription) which don't
     * naturally retry. Bulk flows manage their own retry semantics.
     */
    async _withFreshBrowser(renderFn) {
        try {
            const browser = await this.initBrowser();
            return await renderFn(browser);
        } catch (error) {
            const msg = (error && error.message) || '';
            const isDeadBrowser = /Connection closed|Protocol error|Target closed|Session closed/i.test(msg);
            if (!isDeadBrowser) throw error;

            logger.warn(`PDF render failed with "${msg}" — relaunching browser and retrying once`);
            try { if (this.browser) await this.browser.close(); } catch (_) {}
            this.browser = null;
            const browser = await this.initBrowser();
            return renderFn(browser);
        }
    }

    /**
     * Pre-load templates into memory cache
     */
    async preloadTemplates() {
        try {
            logger.info('Pre-loading PDF templates into cache');
            this.templateCache.soil = await fs.readFile(this.soilTemplatePath, 'utf-8');
            this.templateCache.water = await fs.readFile(this.waterTemplatePath, 'utf-8');

            // Load fertilizer templates
            try {
                this.templateCache.fertilizer_normal = await fs.readFile(this.fertilizerNormalTemplatePath, 'utf-8');
                this.templateCache.fertilizer_small_fruit = await fs.readFile(this.fertilizerSmallFruitTemplatePath, 'utf-8');
                this.templateCache.fertilizer_large_fruit = await fs.readFile(this.fertilizerLargeFruitTemplatePath, 'utf-8');
            } catch (e) {
                logger.warn('Fertilizer templates not found, will load on demand');
            }

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
            try {
                this.templateCache.prescription = await fs.readFile(this.prescriptionTemplatePath, 'utf-8');
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
    async loadTemplate(type = 'soil', cropType = 'normal') {
        // For fertilizer templates, use crop-specific cache key
        const cacheKey = type === 'fertilizer' ? `${type}_${cropType}` : type;

        // Return from cache if available
        if (this.templateCache[cacheKey]) {
            return this.templateCache[cacheKey];
        }

        try {
            let templatePath;
            if (type === 'water') {
                templatePath = this.waterTemplatePath;
            } else if (type === 'fertilizer') {
                // Select template based on crop type
                if (cropType === 'small-fruit') {
                    templatePath = this.fertilizerSmallFruitTemplatePath;
                } else if (cropType === 'large-fruit') {
                    templatePath = this.fertilizerLargeFruitTemplatePath;
                } else {
                    templatePath = this.fertilizerNormalTemplatePath;
                }
            } else {
                templatePath = this.soilTemplatePath;
            }

            const template = await fs.readFile(templatePath, 'utf-8');
            this.templateCache[cacheKey] = template;
            return template;
        } catch (error) {
            logger.error(`Failed to load HTML template (${type}, ${cropType}): ${error.message}`);
            throw new Error(`PDF template not found for type: ${type}, cropType: ${cropType}`);
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
     * Build day 45 row conditionally based on Urea / Ammonium Sulphate values
     */
    _buildDay45Row(data, formatNumber) {
        const ureaVal = formatNumber(data.day45);
        const asVal = formatNumber(data.day45As);
        const hasUrea = ureaVal !== '';
        const hasAs = asVal !== '';

        if (hasUrea && hasAs) {
            return `<div class="fertilizer-row">(૪) ૪૫ દિવસની અવસ્થાએ = <span class="field-value">${ureaVal}</span> કિલો/વિઘે (યુરીયા) અથવા <span class="field-value">${asVal}</span> કિલો/વિઘે (એમોનીયમ સલ્ફેટ)</div>`;
        } else if (hasAs) {
            return `<div class="fertilizer-row">(૪) ૪૫ દિવસની અવસ્થાએ = <span class="field-value">${asVal}</span> કિલો/વિઘે (એમોનીયમ સલ્ફેટ)</div>`;
        } else {
            return `<div class="fertilizer-row">(૪) ૪૫ દિવસની અવસ્થાએ = <span class="field-value">${ureaVal}</span> કિલો/વિઘે (યુરીયા)</div>`;
        }
    }

    /**
     * Build day 75 row conditionally based on Urea / Ammonium Sulphate values
     */
    _buildDay75Row(data, formatNumber) {
        const ureaVal = formatNumber(data.day75);
        const asVal = formatNumber(data.day75As);
        const hasUrea = ureaVal !== '';
        const hasAs = asVal !== '';

        if (hasUrea && hasAs) {
            return `<div class="fertilizer-row">(૬) ૭૫ દિવસની અવસ્થાએ = <span class="field-value">${ureaVal}</span> કિલો/વિઘે (યુરીયા) અથવા <span class="field-value">${asVal}</span> કિલો/વિઘે (એમોનીયમ સલ્ફેટ)</div>`;
        } else if (hasAs) {
            return `<div class="fertilizer-row">(૬) ૭૫ દિવસની અવસ્થાએ = <span class="field-value">${asVal}</span> કિલો/વિઘે (એમોનીયમ સલ્ફેટ)</div>`;
        } else {
            return `<div class="fertilizer-row">(૬) ૭૫ દિવસની અવસ્થાએ = <span class="field-value">${ureaVal}</span> કિલો/વિઘે (યુરીયા)</div>`;
        }
    }

    /**
     * Build hormone dose text with conditional unit based on hormone name
     * Fenteplus (ફેન્ટેકપ્લસ) → મિલી/પંપ દીઠ, Projib (પ્રોજીબ) → ગ્રામ/પંપ દીઠ
     */
    _buildHormoneDoseWithUnit(hormoneName, hormoneDose, formatNumber) {
        const doseVal = formatNumber(hormoneDose);
        if (!doseVal) return '';
        const unit = hormoneName === 'પ્રોજીબ' ? 'ગ્રામ/પંપ દીઠ' : 'મિલી/પંપ દીઠ';
        return `${doseVal} ${unit}`;
    }

    /**
     * Fill fertilizer template with sample data - Normal Crops (Cotton, etc.)
     */
    fillFertilizerNormalTemplate(template, data) {
        let html = template;

        // Helper function to format numbers - allow decimals
        const formatNumber = (value, decimals = 2) => {
            if (value === null || value === undefined || value === '') return '';
            const num = Number(value);
            if (Number.isInteger(num)) return num.toString();
            return num.toFixed(decimals);
        };

        // Helper function to safely get value
        const getValue = (value) => {
            return value || '';
        };

        // Map all placeholders explicitly
        const replacements = {
            // Basic info
            '{{sampleNumber}}': getValue(data.sampleNumber),
            '{{farmerName}}': getValue(data.farmerName),
            '{{farmsName}}': getValue(data.farmsName),
            '{{cropName}}': getValue(data.cropName),
            '{{date}}': getValue(data.sessionDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]),

            // N-P-K recommendation values
            '{{nValue}}': formatNumber(data.nValue),
            '{{pValue}}': formatNumber(data.pValue),
            '{{kValue}}': formatNumber(data.kValue),

            // Section A - Organic Fertilizers
            '{{organicManure}}': formatNumber(data.organicManure),
            '{{castorCake}}': formatNumber(data.castorCake),
            '{{gypsum}}': formatNumber(data.gypsum),
            '{{sardarAmin}}': formatNumber(data.sardarAmin),
            '{{micronutrient}}': formatNumber(data.micronutrient),
            '{{borocol}}': formatNumber(data.borocol),
            '{{ferrous}}': formatNumber(data.ferrous),

            // Section B - Chemical Fertilizers
            '{{dap}}': formatNumber(data.dap),
            '{{npk12}}': formatNumber(data.npk12),
            '{{asp}}': formatNumber(data.asp),
            '{{narmadaPhos}}': formatNumber(data.narmadaPhos),
            '{{ssp}}': formatNumber(data.ssp),
            '{{ammoniumSulphate}}': formatNumber(data.ammoniumSulphate),
            '{{mop}}': formatNumber(data.mop),
            '{{ureaBase}}': formatNumber(data.ureaBase),

            // Section 2 - Dose fertilizers (after crop emergence)
            '{{day15}}': formatNumber(data.day15),
            '{{day25Npk}}': formatNumber(data.day25Npk),
            '{{day25Tricho}}': formatNumber(data.day25Tricho),
            '{{day30}}': formatNumber(data.day30),
            '{{day45_row}}': this._buildDay45Row(data, formatNumber),
            '{{day60}}': formatNumber(data.day60),
            '{{day75_row}}': this._buildDay75Row(data, formatNumber),
            '{{day90Urea}}': formatNumber(data.day90Urea),
            '{{day90Mag}}': formatNumber(data.day90Mag),
            '{{day105}}': formatNumber(data.day105),
            '{{day115}}': formatNumber(data.day115),
            '{{day130}}': formatNumber(data.day130),
            '{{day145}}': formatNumber(data.day145),
            '{{day160}}': formatNumber(data.day160),

            // Section 3 - Spray fertilizers (3 sprays with uniform structure)
            // Spray 1
            '{{spray1_stage}}': formatNumber(data.spray1_stage, 0),
            '{{spray1_npkType}}': getValue(data.spray1_npkType),
            '{{spray1_npkDose}}': formatNumber(data.spray1_npkDose),
            '{{spray1_hormoneName}}': getValue(data.spray1_hormoneName),
            '{{spray1_hormoneDoseWithUnit}}': this._buildHormoneDoseWithUnit(data.spray1_hormoneName, data.spray1_hormoneDose, formatNumber),

            // Spray 2
            '{{spray2_stage}}': formatNumber(data.spray2_stage, 0),
            '{{spray2_npkType}}': getValue(data.spray2_npkType),
            '{{spray2_npkDose}}': formatNumber(data.spray2_npkDose),
            '{{spray2_hormoneName}}': getValue(data.spray2_hormoneName),
            '{{spray2_hormoneDoseWithUnit}}': this._buildHormoneDoseWithUnit(data.spray2_hormoneName, data.spray2_hormoneDose, formatNumber),

            // Spray 3
            '{{spray3_stage}}': formatNumber(data.spray3_stage, 0),
            '{{spray3_npkType}}': getValue(data.spray3_npkType),
            '{{spray3_npkDose}}': formatNumber(data.spray3_npkDose),
            '{{spray3_hormoneName}}': getValue(data.spray3_hormoneName),
            '{{spray3_hormoneDoseWithUnit}}': this._buildHormoneDoseWithUnit(data.spray3_hormoneName, data.spray3_hormoneDose, formatNumber),
        };

        // Replace all placeholders
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Fill fertilizer template with sample data - Small Fruit Trees
     */
    fillFertilizerSmallFruitTemplate(template, data) {
        let html = template;

        // Helper function to format numbers - allow decimals
        const formatNumber = (value, decimals = 2) => {
            if (value === null || value === undefined || value === '') return '';
            const num = Number(value);
            if (Number.isInteger(num)) return num.toString();
            return num.toFixed(decimals);
        };

        // Helper function to safely get value
        const getValue = (value) => {
            return value || '';
        };

        // Map all placeholders explicitly
        const replacements = {
            // Basic info
            '{{sampleNumber}}': getValue(data.sampleNumber),
            '{{farmerName}}': getValue(data.farmerName),
            '{{farmsName}}': getValue(data.farmsName),
            '{{cropName}}': getValue(data.cropName),
            '{{date}}': getValue(data.sessionDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]),

            // Month names (selected months for each section)
            '{{m1_month}}': getValue(data.m1_month),
            '{{m2_month}}': getValue(data.m2_month),
            '{{m3_month}}': getValue(data.m3_month),
            '{{m4_month}}': getValue(data.m4_month),

            // M1 fertilizers
            '{{m1_dap}}': formatNumber(data.m1_dap),
            '{{m1_npk}}': formatNumber(data.m1_npk),
            '{{m1_asp}}': formatNumber(data.m1_asp),
            '{{m1_narmada}}': formatNumber(data.m1_narmada),
            '{{m1_ssp}}': formatNumber(data.m1_ssp),
            '{{m1_as}}': formatNumber(data.m1_as),
            '{{m1_mop}}': formatNumber(data.m1_mop),
            '{{m1_urea}}': formatNumber(data.m1_urea),
            '{{m1_borocol}}': formatNumber(data.m1_borocol),
            '{{m1_sardaramin}}': formatNumber(data.m1_sardaramin),
            '{{m1_chhaniyu}}': formatNumber(data.m1_chhaniyu),
            '{{m1_erandakhol}}': formatNumber(data.m1_erandakhol),

            // M2 fertilizers
            '{{m2_dap}}': formatNumber(data.m2_dap),
            '{{m2_npk}}': formatNumber(data.m2_npk),
            '{{m2_asp}}': formatNumber(data.m2_asp),
            '{{m2_narmada}}': formatNumber(data.m2_narmada),
            '{{m2_ssp}}': formatNumber(data.m2_ssp),
            '{{m2_as}}': formatNumber(data.m2_as),
            '{{m2_mop}}': formatNumber(data.m2_mop),
            '{{m2_urea}}': formatNumber(data.m2_urea),

            // M3 fertilizers
            '{{m3_dap}}': formatNumber(data.m3_dap),
            '{{m3_npk}}': formatNumber(data.m3_npk),
            '{{m3_asp}}': formatNumber(data.m3_asp),
            '{{m3_narmada}}': formatNumber(data.m3_narmada),
            '{{m3_ssp}}': formatNumber(data.m3_ssp),
            '{{m3_as}}': formatNumber(data.m3_as),
            '{{m3_mop}}': formatNumber(data.m3_mop),
            '{{m3_urea}}': formatNumber(data.m3_urea),
            '{{m3_borocol}}': formatNumber(data.m3_borocol),
            '{{m3_sardaramin}}': formatNumber(data.m3_sardaramin),
            '{{m3_chhaniyu}}': formatNumber(data.m3_chhaniyu),
            '{{m3_erandakhol}}': formatNumber(data.m3_erandakhol),

            // M4 fertilizers
            '{{m4_dap}}': formatNumber(data.m4_dap),
            '{{m4_npk}}': formatNumber(data.m4_npk),
            '{{m4_asp}}': formatNumber(data.m4_asp),
            '{{m4_narmada}}': formatNumber(data.m4_narmada),
            '{{m4_ssp}}': formatNumber(data.m4_ssp),
            '{{m4_as}}': formatNumber(data.m4_as),
            '{{m4_mop}}': formatNumber(data.m4_mop),
            '{{m4_urea}}': formatNumber(data.m4_urea),
            '{{m4_borocol}}': formatNumber(data.m4_borocol),
            '{{m4_sardaramin}}': formatNumber(data.m4_sardaramin),
            '{{m4_chhaniyu}}': formatNumber(data.m4_chhaniyu),
            '{{m4_erandakhol}}': formatNumber(data.m4_erandakhol),

            // M5 - Spray fertilizers
            '{{m5_npk1919}}': formatNumber(data.m5_npk1919),
            '{{m5_npk0052}}': formatNumber(data.m5_npk0052),
            '{{m5_npk1261}}': formatNumber(data.m5_npk1261),
            '{{m5_npk1300}}': formatNumber(data.m5_npk1300),
            '{{m5_micromix}}': formatNumber(data.m5_micromix),
        };

        // Replace all placeholders
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Fill fertilizer template with sample data - Large Fruit Trees
     */
    fillFertilizerLargeFruitTemplate(template, data) {
        let html = template;

        // Helper function to format numbers - allow decimals for large fruit crop
        const formatNumber = (value, decimals = 2) => {
            if (value === null || value === undefined || value === '') return '';
            const num = Number(value);
            // If it's a whole number, show without decimals for cleaner display
            if (Number.isInteger(num)) return num.toString();
            return num.toFixed(decimals);
        };

        // Helper function to safely get value
        const getValue = (value) => {
            return value || '';
        };

        // Map all placeholders explicitly
        const replacements = {
            // Basic info
            '{{sampleNumber}}': getValue(data.sampleNumber),
            '{{farmerName}}': getValue(data.farmerName),
            '{{farmsName}}': getValue(data.farmsName),
            '{{cropName}}': getValue(data.cropName),
            '{{date}}': getValue(data.sessionDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]),

            // Month names (selected months for each section)
            '{{m1_month}}': getValue(data.m1_month),
            '{{m2_month}}': getValue(data.m2_month),
            '{{m3_month}}': getValue(data.m3_month),
            '{{m4_month}}': getValue(data.m4_month),

            // M1 fertilizers
            '{{m1_dap}}': formatNumber(data.m1_dap),
            '{{m1_npk}}': formatNumber(data.m1_npk),
            '{{m1_asp}}': formatNumber(data.m1_asp),
            '{{m1_narmada}}': formatNumber(data.m1_narmada),
            '{{m1_ssp}}': formatNumber(data.m1_ssp),
            '{{m1_as}}': formatNumber(data.m1_as),
            '{{m1_mop}}': formatNumber(data.m1_mop),
            '{{m1_urea}}': formatNumber(data.m1_urea),

            // M2 fertilizers
            '{{m2_dap}}': formatNumber(data.m2_dap),
            '{{m2_npk}}': formatNumber(data.m2_npk),
            '{{m2_asp}}': formatNumber(data.m2_asp),
            '{{m2_narmada}}': formatNumber(data.m2_narmada),
            '{{m2_ssp}}': formatNumber(data.m2_ssp),
            '{{m2_as}}': formatNumber(data.m2_as),
            '{{m2_mop}}': formatNumber(data.m2_mop),
            '{{m2_urea}}': formatNumber(data.m2_urea),

            // M3 fertilizers
            '{{m3_dap}}': formatNumber(data.m3_dap),
            '{{m3_npk}}': formatNumber(data.m3_npk),
            '{{m3_asp}}': formatNumber(data.m3_asp),
            '{{m3_narmada}}': formatNumber(data.m3_narmada),
            '{{m3_ssp}}': formatNumber(data.m3_ssp),
            '{{m3_as}}': formatNumber(data.m3_as),
            '{{m3_mop}}': formatNumber(data.m3_mop),
            '{{m3_urea}}': formatNumber(data.m3_urea),

            // M1 extra fertilizers (large-fruit only)
            '{{m1_borocol}}': formatNumber(data.m1_borocol),
            '{{m1_sardaramin}}': formatNumber(data.m1_sardaramin),
            '{{m1_chhaniyu}}': formatNumber(data.m1_chhaniyu),
            '{{m1_erandakhol}}': formatNumber(data.m1_erandakhol),

            // M3 extra fertilizers (large-fruit only)
            '{{m3_borocol}}': formatNumber(data.m3_borocol),
            '{{m3_sardaramin}}': formatNumber(data.m3_sardaramin),
            '{{m3_chhaniyu}}': formatNumber(data.m3_chhaniyu),
            '{{m3_erandakhol}}': formatNumber(data.m3_erandakhol),

            // M4 fertilizers
            '{{m4_dap}}': formatNumber(data.m4_dap),
            '{{m4_npk}}': formatNumber(data.m4_npk),
            '{{m4_asp}}': formatNumber(data.m4_asp),
            '{{m4_narmada}}': formatNumber(data.m4_narmada),
            '{{m4_ssp}}': formatNumber(data.m4_ssp),
            '{{m4_as}}': formatNumber(data.m4_as),
            '{{m4_mop}}': formatNumber(data.m4_mop),
            '{{m4_urea}}': formatNumber(data.m4_urea),
            '{{m4_borocol}}': formatNumber(data.m4_borocol),
            '{{m4_sardaramin}}': formatNumber(data.m4_sardaramin),
            '{{m4_chhaniyu}}': formatNumber(data.m4_chhaniyu),
            '{{m4_erandakhol}}': formatNumber(data.m4_erandakhol),

            // M5 - Spray fertilizers
            '{{m5_npk1919}}': formatNumber(data.m5_npk1919),
            '{{m5_npk0052}}': formatNumber(data.m5_npk0052),
            '{{m5_npk1261}}': formatNumber(data.m5_npk1261),
            '{{m5_npk1300}}': formatNumber(data.m5_npk1300),
            '{{m5_micromix}}': formatNumber(data.m5_micromix),
        };

        // Replace all placeholders
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Fill fertilizer template with sample data (dispatcher function)
     * Calls the appropriate template filler based on crop type
     */
    fillFertilizerTemplate(template, data) {
        const cropType = data.type || 'normal';

        logger.info(`Filling fertilizer template for crop type: ${cropType}`);
        logger.debug(`Sample ID: ${data._id}, Farmer: ${data.farmerName}, Crop: ${data.cropName}`);

        // Convert Mongoose document to plain object if needed
        const plainData = data.toObject ? data.toObject() : data;

        if (cropType === 'small-fruit') {
            return this.fillFertilizerSmallFruitTemplate(template, plainData);
        } else if (cropType === 'large-fruit') {
            return this.fillFertilizerLargeFruitTemplate(template, plainData);
        } else {
            return this.fillFertilizerNormalTemplate(template, plainData);
        }
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
            const cropType = sample.type || 'normal'; // For fertilizer samples
            const template = await this.loadTemplate(type, cropType);

            let html;
            if (type === 'water') {
                html = this.fillWaterTemplate(template, sample);
            } else if (type === 'fertilizer') {
                html = this.fillFertilizerTemplate(template, sample);
            } else {
                html = this.fillTemplate(template, sample);
            }

            // Inject font CSS directly
            const htmlWithFonts = html.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(htmlWithFonts, {
                waitUntil: 'domcontentloaded'
            });

            // Minimal wait for font rendering
            await new Promise(resolve => setTimeout(resolve, 50));

            const pdfOptions = {
                format: 'A4',
                printBackground: true,
                margin: { top: '3mm', right: '3mm', bottom: '3mm', left: '3mm' },
                preferCSSPageSize: true
            };

            // Only scale down for non-fertilizer types (fertilizer templates are already sized for A4)
            if (type !== 'fertilizer') {
                pdfOptions.scale = 0.95;
            }

            const pdfBuffer = await page.pdf(pdfOptions);

            return {
                sampleId: sample._id,
                sampleNumber: sample.sampleNumber || '',
                farmerName: sample.farmerName || sample.farmersName,
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
        return this._withFreshBrowser(async (browser) => {
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
                try { await page.close(); } catch (_) { /* browser may already be gone */ }
            }
        });
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
            '{{taluka}}': data.taluka || '',
            '{{district}}': data.district || '',
            '{{state}}': data.state || '',
            '{{pincode}}': data.pincode || '',
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
     * Generate Quotation PDF using the company letterhead template.
     * Composes a letter-style body from the quotation content + installment table.
     */
    async generateQuotationPDF(quotation, project) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating quotation PDF for: ${quotation?._id}`);

            const template = this.templateCache.letter || await fs.readFile(this.letterTemplatePath, 'utf-8');

            const formatINR = (value) => {
                const num = Number(value || 0);
                return new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                }).format(num);
            };

            const formatDate = (date) => {
                if (!date) return '';
                const d = new Date(date);
                return d.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
            };

            const installments = Array.isArray(quotation.installments) ? quotation.installments : [];
            const installmentRows = installments.map((installment) => `
                <tr>
                    <td style="padding:10px 12px;border:1px solid #d1d5db;text-align:center;font-weight:700;">${installment.installmentNumber}</td>
                    <td style="padding:10px 12px;border:1px solid #d1d5db;">${formatDate(installment.dueDate)}</td>
                    <td style="padding:10px 12px;border:1px solid #d1d5db;text-align:right;font-weight:700;">${formatINR(installment.amount)}</td>
                </tr>
            `).join('');

            const greetingName = project?.clientName || 'Esteemed Farmer';
            const farmName = project?.name || '';
            const farmLocation = [
                project?.location?.taluka,
                project?.location?.district,
                project?.location?.state
            ].filter(Boolean).join(', ');

            const composedBody = `
                <p>Dear ${greetingName},</p>
                <p>
                    Thank you for engaging Shiv Agri Consultancy for your farm${farmName ? ` <strong>"${farmName}"</strong>` : ''}${farmLocation ? `, located at ${farmLocation}` : ''}.
                    Based on our review, please find below the proposed annual consultancy quotation.
                </p>

                <h3 style="font-size:15px;margin:20px 0 8px;font-weight:700;text-decoration:underline;">Scope &amp; Details</h3>
                <div style="font-size:14px;line-height:1.8;">${quotation.content || ''}</div>

                <h3 style="font-size:15px;margin:24px 0 8px;font-weight:700;text-decoration:underline;">Annual Fee</h3>
                <p style="font-size:18px;font-weight:700;color:#15803D;">${formatINR(quotation.amountPerYear)} per year</p>

                <h3 style="font-size:15px;margin:24px 0 8px;font-weight:700;text-decoration:underline;">Payment Schedule</h3>
                <p>The annual fee is divided into 4 equal quarterly installments as follows:</p>
                <table style="width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:14px;">
                    <thead>
                        <tr style="background:#F0FDF4;">
                            <th style="padding:10px 12px;border:1px solid #d1d5db;text-align:center;">Installment</th>
                            <th style="padding:10px 12px;border:1px solid #d1d5db;text-align:left;">Due Date</th>
                            <th style="padding:10px 12px;border:1px solid #d1d5db;text-align:right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${installmentRows}</tbody>
                    <tfoot>
                        <tr style="background:#FEFCE8;font-weight:700;">
                            <td colspan="2" style="padding:10px 12px;border:1px solid #d1d5db;text-align:right;">Total (Annual)</td>
                            <td style="padding:10px 12px;border:1px solid #d1d5db;text-align:right;">${formatINR(quotation.amountPerYear)}</td>
                        </tr>
                    </tfoot>
                </table>

                <p>Please review and confirm your acceptance through the Shiv Agri app to proceed with the engagement. Feel free to reach out for any clarification.</p>
                <p>We look forward to a long and successful partnership.</p>
            `;

            const letterData = {
                date: quotation.createdAt || new Date(),
                content: composedBody
            };

            const html = this.fillLetterTemplate(template, letterData);

            await page.setContent(html, { waitUntil: 'domcontentloaded' });
            await page.addStyleTag({
                content: `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');`
            });
            await new Promise(resolve => setTimeout(resolve, 200));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
            });

            logger.info(`Quotation PDF generated for ${quotation._id}`);
            return pdfBuffer;
        } catch (error) {
            logger.error(`Error generating quotation PDF: ${error.message}`, { stack: error.stack });
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

    /**
     * Generate PDF for a single fertilizer sample
     */
    async generateFertilizerPDF(sampleData) {
        try {
            // Validate sample data
            if (!sampleData) {
                throw new Error('Sample data is required');
            }

            logger.info(`Generating fertilizer PDF for sample: ${sampleData._id || 'unknown'}`);

            // Convert Mongoose document to plain object if needed
            const plainData = sampleData.toObject ? sampleData.toObject() : sampleData;

            // Load and fill template based on crop type
            const cropType = plainData.type || 'normal';
            logger.info(`Loading fertilizer template for crop type: ${cropType}`);
            const template = await this.loadTemplate('fertilizer', cropType);

            logger.info(`Filling fertilizer template with sample data`);
            const html = this.fillFertilizerTemplate(template, plainData);

            if (!html || html.length === 0) {
                throw new Error('Template filling produced empty HTML');
            }

            logger.info(`Template filled successfully, HTML length: ${html.length}`);

            // Inject font CSS
            const htmlWithFonts = html.includes('</head>')
                ? html.replace('</head>', `<style>${this.fontCSS}</style></head>`)
                : html;

            logger.info(`Initializing browser and page`);
            // Initialize browser and page
            const browser = await this.initBrowser();

            if (!browser) {
                throw new Error('Failed to initialize browser');
            }

            logger.info(`Browser initialized, creating new page`);
            const page = await browser.newPage();

            try {

                logger.info(`Setting page content`);
                await page.setContent(htmlWithFonts, {
                    waitUntil: 'domcontentloaded'
                });

                // Wait for rendering
                await new Promise(resolve => setTimeout(resolve, 200));

                logger.info(`Generating PDF buffer`);
                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '3mm', right: '3mm', bottom: '3mm', left: '3mm' },
                    preferCSSPageSize: true
                });

                logger.info(`Fertilizer PDF generated successfully, closing page`);
                return pdfBuffer;

            } finally {
                // Always close the page
                try {
                    if (page && !page.isClosed()) {
                        await page.close();
                    }
                } catch (closeError) {
                    logger.error(`Error closing page: ${closeError.message}`);
                }
            }

        } catch (error) {
            logger.error(`Error generating fertilizer PDF: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Generate bulk PDFs for fertilizer samples
     */
    async generateBulkFertilizerPDFs(samplesArray) {
        logger.info(`Generating bulk fertilizer PDFs for ${samplesArray.length} samples`);
        const results = await this._processInParallel(samplesArray, 'fertilizer');
        logger.info(`Bulk fertilizer PDFs generation completed`);
        return results;
    }

    /**
     * Generate combined PDF for all fertilizer samples in a session
     */
    async generateCombinedFertilizerPDF(samplesArray) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`Generating combined fertilizer PDF for ${samplesArray.length} samples`);

            let combinedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        ${this.fontCSS}
        @page {
            margin: 0;
        }
        body {
            margin: 0;
            padding: 0;
        }
        .page-break {
            page-break-after: always;
        }
    </style>
</head>
<body>`;

            // Add each sample as a page
            for (let i = 0; i < samplesArray.length; i++) {
                const sample = samplesArray[i];
                const cropType = sample.type || 'normal';
                const template = await this.loadTemplate('fertilizer', cropType);
                const pageHtml = this.fillFertilizerTemplate(template, sample)
                    .replace('<!DOCTYPE html>', '')
                    .replace(/<html[^>]*>/, '')
                    .replace('</html>', '')
                    .replace(/<head>[\s\S]*?<\/head>/, '')
                    .replace(/<body[^>]*>/, '')
                    .replace('</body>', '');

                combinedHtml += `<div class="page-break">${pageHtml}</div>`;
            }

            combinedHtml += '</body></html>';

            await page.setContent(combinedHtml, {
                waitUntil: 'domcontentloaded'
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '3mm', right: '3mm', bottom: '3mm', left: '3mm' },
                preferCSSPageSize: true
            });

            await page.close();
            logger.info(`Combined fertilizer PDF generated successfully`);
            return pdfBuffer;

        } catch (error) {
            logger.error(`Error generating combined fertilizer PDF: ${error.message}`);
            await page.close();
            throw error;
        }
    }
    /**
     * Convert a digit string (or number) to Gujarati numerals.
     */
    _toGujaratiDigits(input) {
        if (input === null || input === undefined) return '';
        const map = ['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯'];
        return String(input).replace(/\d/g, (d) => map[Number(d)]);
    }

    /**
     * Format a Date as DD/MM/YY in Gujarati numerals.
     */
    _formatGujaratiDate(date) {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return this._toGujaratiDigits(`${dd}/${mm}/${yy}`);
    }

    /**
     * Fetch a remote image and return a data URI (base64). Used so Puppeteer
     * doesn't have to make network requests during PDF render.
     */
    async _fetchImageAsDataUri(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                logger.warn(`[Prescription PDF] Image fetch failed: ${url} (${res.status})`);
                return null;
            }
            const mime = res.headers.get('content-type') || 'image/jpeg';
            const buf = Buffer.from(await res.arrayBuffer());
            return `data:${mime};base64,${buf.toString('base64')}`;
        } catch (err) {
            logger.warn(`[Prescription PDF] Image fetch error for ${url}: ${err.message}`);
            return null;
        }
    }

    /**
     * Build the image-pages HTML appended after the prescription sheet.
     * Each page gets a header indicating it's an attached photo plus a
     * numbered caption.
     */
    async _buildImagePagesHtml(attachedImages) {
        if (!Array.isArray(attachedImages) || attachedImages.length === 0) return '';
        const pages = [];
        const total = attachedImages.length;
        let index = 1;
        for (const img of attachedImages) {
            if (!img?.url) continue;
            const dataUri = await this._fetchImageAsDataUri(img.url);
            const src = dataUri || img.url;
            const totalGu = this._toGujaratiDigits(total);
            const idxGu = this._toGujaratiDigits(index);
            pages.push(`
                <div class="img-page">
                    <div class="img-header">જોડેલા ફોટા (Attached Photos) — ${idxGu} / ${totalGu}</div>
                    <div class="img-wrap"><img src="${src}" alt="Prescription attachment ${index}" /></div>
                </div>
            `);
            index += 1;
        }
        return pages.join('\n');
    }

    /**
     * Escape user text for safe HTML interpolation.
     */
    _escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/[<>&"']/g, (c) => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /**
     * Replace placeholders in the prescription template.
     */
    _fillPrescriptionTemplate(template, prescription, project, imagePagesHtml) {
        const s = prescription.structured || {};
        const fo = s.farmingOperations || {};
        const f = s.fertilizers || {};
        const p = s.pests || {};
        const d = s.diseases || {};
        const photoCount = Array.isArray(prescription.attachedImages) ? prescription.attachedImages.length : 0;

        const checkClass = (v) => (v ? 'checked' : '');
        const text = (v) => this._escapeHtml(v);

        // Photo indication shown ONLY when photos are attached.
        // Long banner on page 1; short hint at the bottom of page 2.
        const photoNotice = photoCount > 0
            ? `<div class="photo-notice">
                <span class="icon">📎</span>
                <span>
                  <strong>${this._toGujaratiDigits(photoCount)} ${photoCount === 1 ? 'ફોટો' : 'ફોટા'} જોડેલા છે</strong>
                  &nbsp;·&nbsp; ${photoCount} photo${photoCount === 1 ? '' : 's'} attached — see ${photoCount === 1 ? 'final page' : 'final pages'}.
                </span>
               </div>`
            : '';

        const photoNoticeShort = photoCount > 0
            ? `<div style="font-size:9pt; color:#555;">📎 ${this._toGujaratiDigits(photoCount)} ${photoCount === 1 ? 'ફોટો' : 'ફોટા'} જોડેલા છે</div>
               <div style="font-size:8.5pt; color:#777;">${photoCount} photo${photoCount === 1 ? '' : 's'} appended after this page</div>`
            : '';

        const otherNotesRaw = (s.otherNotes || '').trim();
        const otherNotesBody = otherNotesRaw
            ? this._escapeHtml(otherNotesRaw)
            : '<div class="notes-empty">— કોઈ વધારાની નોંધ નથી / No additional notes —</div>';

        const replacements = {
            '{{farmerName}}': text(s.farmerName || project?.name || ''),
            '{{visitDate}}': this._formatGujaratiDate(s.visitDate),
            '{{lastVisitReview}}': text(s.lastVisitReview),

            '{{landPreparation}}': text(s.landPreparation),
            '{{sowingPlanting}}': text(s.sowingPlanting),

            '{{op_leveling}}': checkClass(fo.leveling),
            '{{op_marking}}': checkClass(fo.marking),
            '{{op_digging}}': checkClass(fo.digging),
            '{{op_soilFilling}}': checkClass(fo.soilFilling),
            '{{op_tractor}}': checkClass(fo.tractor),
            '{{op_supports}}': checkClass(fo.supports),
            '{{op_fillGaps}}': checkClass(fo.fillGaps),
            '{{op_pruning}}': checkClass(fo.pruning),
            '{{op_otherChecked}}': checkClass(fo.other && fo.other.trim()),
            '{{op_other}}': text(fo.other),

            '{{irrigation}}': text(s.irrigation),
            '{{weedControl}}': text(s.weedControl),

            '{{f_farmyardManure}}': checkClass(f.farmyardManure),
            '{{f_chemical}}': checkClass(f.chemical),
            '{{f_organic}}': checkClass(f.organic),
            '{{f_jivamrut}}': checkClass(f.jivamrut),
            '{{f_spray}}': checkClass(f.spray),

            '{{p_soilBorne}}': checkClass(p.soilBorne),
            '{{p_root}}': checkClass(p.root),
            '{{p_stem}}': checkClass(p.stem),
            '{{p_leaf}}': checkClass(p.leaf),
            '{{p_flower}}': checkClass(p.flower),
            '{{p_fruit}}': checkClass(p.fruit),

            '{{d_soilBorne}}': checkClass(d.soilBorne),
            '{{d_stem}}': checkClass(d.stem),
            '{{d_branch}}': checkClass(d.branch),
            '{{d_leaf}}': checkClass(d.leaf),
            '{{d_flower}}': checkClass(d.flower),
            '{{d_fruit}}': checkClass(d.fruit),
            '{{d_other}}': checkClass(d.other),

            '{{hormoneTreatment}}': checkClass(s.hormoneTreatment),
            '{{fruitHarvesting}}': checkClass(s.fruitHarvesting),
            '{{grading}}': checkClass(s.grading),
            '{{packing}}': checkClass(s.packing),

            // Other notes — full page 2 of the PDF
            '{{otherNotesBody}}': otherNotesBody,

            // Photo indications (only rendered when photos are attached)
            '{{photoNotice}}': photoNotice,
            '{{photoNoticeShort}}': photoNoticeShort,

            '{{imagePages}}': imagePagesHtml || ''
        };

        let html = template;
        Object.entries(replacements).forEach(([key, value]) => {
            html = html.split(key).join(value);
        });
        return html;
    }

    /**
     * Generate the prescription PDF (matches the Shiv Agri printed visit slip)
     * and append any attached photos as full-page images at the end.
     */
    async generatePrescriptionPDF(prescription, project = {}) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            logger.info(`[Prescription PDF] Generating for project=${project?._id}, images=${prescription?.attachedImages?.length || 0}`);

            // Always read the prescription template fresh from disk — this is a
            // low-traffic path and reading on every request lets template tweaks
            // land without a backend restart. (Lab-report templates remain cached
            // because they're hot and rarely changed.)
            const template = await fs.readFile(this.prescriptionTemplatePath, 'utf-8');

            const imagePagesHtml = await this._buildImagePagesHtml(prescription.attachedImages || []);
            let html = this._fillPrescriptionTemplate(template, prescription, project, imagePagesHtml);

            // Inject Gujarati font
            html = html.replace('</head>', `<style>${this.fontCSS}</style></head>`);

            await page.setContent(html, { waitUntil: 'domcontentloaded' });
            await new Promise((resolve) => setTimeout(resolve, 120));

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
                preferCSSPageSize: true
            });

            logger.info(`[Prescription PDF] Generated successfully`);
            return pdfBuffer;
        } catch (error) {
            logger.error(`[Prescription PDF] Error: ${error.message}`, { stack: error.stack });
            throw error;
        } finally {
            await page.close();
        }
    }
}

// Singleton instance
const pdfGeneratorService = new PDFGeneratorService();

module.exports = pdfGeneratorService;
