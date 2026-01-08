/**
 * Soil Testing Classification Rulebook
 * Classifies soil parameters based on scientific ranges
 */

const soilTestingRulebook = {
    // 1. pH (જમીનનો રસાયણ)
    pH: {
        parameter: "pH",
        gujaratiName: "જમીનનો રસાયણ (pH)",
        ranges: [
            {
                min: 0,
                max: 5.4,
                classification: "ઓછું",
                label: "એસિડિક",
                classificationEn: "Low",
                labelEn: "Acidic"
            },
            {
                min: 5.5,
                max: 8.19,
                classification: "મધ્યમ",
                label: "સામાન્ય",
                classificationEn: "Medium",
                labelEn: "Normal"
            },
            {
                min: 8.2,
                max: Infinity,
                classification: "વધારે",
                label: "ભાસ્મિક",
                classificationEn: "High",
                labelEn: "Basic"
            }
        ]
    },

    // 2. EC (ક્ષારોની માત્રા)
    EC: {
        parameter: "EC",
        gujaratiName: "ક્ષારોની માત્રા (EC)",
        unit: "(મિલી મ્હોજ / સેમી)",
        ranges: [
            {
                min: 0,
                max: 0.66,
                classification: "ઓછું",
                label: "સામાન્ય",
                classificationEn: "Low",
                labelEn: "Normal"
            },
            {
                min: 1,
                max: 3,
                classification: "મધ્યમ",
                label: "નુકસાનકારક",
                classificationEn: "Medium",
                labelEn: "Harmful"
            },
            {
                min: 3,
                max: Infinity,
                classification: "વધારે",
                label: "હાનિકારક",
                classificationEn: "High",
                labelEn: "Damaging"
            }
        ]
    },

    // 3. નાઇટ્રોજન / સેન્દ્રિયકાર્બન (Organic Carbon %)
    nitrogen: {
        parameter: "નાઇટ્રોજન",
        gujaratiName: "નાઇટ્રોજન / સેન્દ્રિયકાર્બન (%)",
        ranges: [
            {
                min: 0,
                max: 0.50,
                classification: "ઓછું",
                classificationEn: "Low"
            },
            {
                min: 0.51,
                max: 0.75,
                classification: "મધ્યમ",
                classificationEn: "Medium"
            },
            {
                min: 0.76,
                max: Infinity,
                classification: "વધારે",
                classificationEn: "High"
            }
        ]
    },

    // 4. કોફરસ (Phosphorus P2O5)
    phosphorus: {
        parameter: "કોફરસ",
        gujaratiName: "લવ્ય કોફરસ (કિલો / હેક્ટર)",
        ranges: [
            {
                min: 0,
                max: 25,
                classification: "ઓછું",
                classificationEn: "Low"
            },
            {
                min: 26,
                max: 60,
                classification: "મધ્યમ",
                classificationEn: "Medium"
            },
            {
                min: 61,
                max: Infinity,
                classification: "વધારે",
                classificationEn: "High"
            }
        ]
    },

    // 5. પોટાશ (Potash K2O)
    potash: {
        parameter: "પોટાશ",
        gujaratiName: "લવ્ય પોટાશ (કિલો / હેક્ટર)",
        ranges: [
            {
                min: 0,
                max: 150,
                classification: "ઓછું",
                classificationEn: "Low"
            },
            {
                min: 151,
                max: 300,
                classification: "મધ્યમ",
                classificationEn: "Medium"
            },
            {
                min: 301,
                max: Infinity,
                classification: "વધારે",
                classificationEn: "High"
            }
        ]
    }
};

/**
 * Classify a parameter value based on the rulebook
 * @param {string} parameterType - Type of parameter (pH, EC, nitrogen, phosphorus, potash)
 * @param {number} value - The measured value
 * @returns {object} Classification result with gujarati and english labels
 */
function classifyParameter(parameterType, value) {
    const rules = soilTestingRulebook[parameterType];

    if (!rules) {
        return {
            classification: "માહિતી ઉપલબ્ધ નથી",
            classificationEn: "Information not available",
            label: "",
            labelEn: ""
        };
    }

    // Handle null, undefined, or invalid values
    if (value === null || value === undefined || isNaN(value)) {
        return {
            classification: "",
            classificationEn: "",
            label: "",
            labelEn: ""
        };
    }

    // Handle negative values
    if (value < 0) {
        return {
            classification: "અયોગ્ય મૂલ્ય",
            classificationEn: "Invalid value",
            label: "",
            labelEn: ""
        };
    }

    // Find the appropriate range
    for (const range of rules.ranges) {
        if (value >= range.min && value <= range.max) {
            return {
                classification: range.classification,
                classificationEn: range.classificationEn,
                label: range.label || "",
                labelEn: range.labelEn || ""
            };
        }
    }

    return {
        classification: "માહિતી ઉપલબ્ધ નથી",
        classificationEn: "Information not available",
        label: "",
        labelEn: ""
    };
}

/**
 * Process all soil test parameters and return classifications
 * @param {object} soilTestData - Object containing all test values
 * @returns {object} Classified results for all parameters
 */
function processSoilTest(soilTestData) {
    return {
        pH: classifyParameter('pH', soilTestData.ph),
        EC: classifyParameter('EC', soilTestData.ec),
        nitrogen: classifyParameter('nitrogen', soilTestData.ocPercent), // Using ocPercent as organic carbon %
        phosphorus: classifyParameter('phosphorus', soilTestData.p2o5),
        potash: classifyParameter('potash', soilTestData.k2o)
    };
}

/**
 * Generate final deduction based on pH and EC values
 * @param {number} ph - pH value
 * @param {number} ec - EC value
 * @returns {object} Final deduction in Gujarati and English
 */
function generateFinalDeduction(ph, ec) {
    // Handle invalid values
    if (ph === null || ph === undefined || isNaN(ph) ||
        ec === null || ec === undefined || isNaN(ec)) {
        return {
            finalDeduction: "",
            finalDeductionEn: ""
        };
    }

    // Rule 1: pH < 8.2 & EC < 1 => બધાજ ખેત પાકો માટે અનુકૂળ છે
    if (ph < 8.2 && ec < 1) {
        return {
            finalDeduction: "બધાજ ખેત પાકો માટે અનુકૂળ છે",
            finalDeductionEn: "Suitable for all field crops"
        };
    }

    if (ph < 8.2) {
        return {
            finalDeduction: "ક્ષારની માત્રા વધારે છે, કૃષિ નિષ્ણાતની સલાહ લેવી",
            finalDeductionEn: "Salt concentration is high; consult an agricultural expert"
        };
    }

    // Rule 2: pH > 8.2 => છાણિયા ખાતર નો વપરાશ વધારવો, જીપ્સમ નો વપરાશ કરવો, ક્ષાર પ્રતિકારક પાકો નું વાવેતર કરવું.
    if (ph >= 8.2) {
        return {
            finalDeduction: "છાણિયા ખાતર નો વપરાશ વધારવો, જીપ્સમ નો વપરાશ કરવો, ક્ષાર પ્રતિકારક પાકો નું વાવેતર કરવું.",
            finalDeductionEn: "Increase use of organic manure, use gypsum, grow salt-resistant crops."
        };
    }

    // Default case (pH between 8.2 and lower, but EC >= 1)
    return {
        finalDeduction: "",
        finalDeductionEn: ""
    };
}

/**
 * Add classifications to sample data
 * @param {object} sampleData - Sample data object
 * @returns {object} Sample data with classifications added
 */
function addClassifications(sampleData) {
    const classifications = processSoilTest(sampleData);
    const deduction = generateFinalDeduction(sampleData.ph, sampleData.ec);

    return {
        ...sampleData,
        // Single result fields per parameter (Gujarati label or classification)
        phResult: classifications.pH.label || classifications.pH.classification,
        ecResult: classifications.EC.label || classifications.EC.classification,
        nitrogenResult: classifications.nitrogen.label || classifications.nitrogen.classification,
        phosphorusResult: classifications.phosphorus.label || classifications.phosphorus.classification,
        potashResult: classifications.potash.label || classifications.potash.classification,

        // English result fields
        phResultEn: classifications.pH.labelEn || classifications.pH.classificationEn,
        ecResultEn: classifications.EC.labelEn || classifications.EC.classificationEn,
        nitrogenResultEn: classifications.nitrogen.labelEn || classifications.nitrogen.classificationEn,
        phosphorusResultEn: classifications.phosphorus.labelEn || classifications.phosphorus.classificationEn,
        potashResultEn: classifications.potash.labelEn || classifications.potash.classificationEn,

        // Final deduction
        finalDeduction: deduction.finalDeduction,
        finalDeductionEn: deduction.finalDeductionEn
    };
}

module.exports = {
    soilTestingRulebook,
    classifyParameter,
    processSoilTest,
    addClassifications,
    generateFinalDeduction
};
