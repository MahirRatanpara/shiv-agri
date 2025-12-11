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
        max: 6.4,
        classification: "ઓછું",
        label: "એસિડિક",
        classificationEn: "Low",
        labelEn: "Acidic"
      },
      {
        min: 6.5,
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
        label: "ભાસિક",
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
        max: 2,
        classification: "મધ્યમ",
        label: "વ્યવસ્થાપનકારક",
        classificationEn: "Medium",
        labelEn: "Manageable"
      },
      {
        min: 2,
        max: Infinity,
        classification: "વધારે",
        label: "ભારી ક્ષારક",
        classificationEn: "High",
        labelEn: "Highly Saline"
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
 * Add classifications to sample data
 * @param {object} sampleData - Sample data object
 * @returns {object} Sample data with classifications added
 */
function addClassifications(sampleData) {
  const classifications = processSoilTest(sampleData);

  return {
    ...sampleData,
    // pH classifications
    phClassification: classifications.pH.classification,
    phClassificationEn: classifications.pH.classificationEn,
    phLabel: classifications.pH.label,
    phLabelEn: classifications.pH.labelEn,

    // EC classifications
    ecClassification: classifications.EC.classification,
    ecClassificationEn: classifications.EC.classificationEn,
    ecLabel: classifications.EC.label,
    ecLabelEn: classifications.EC.labelEn,

    // Nitrogen/Organic Carbon classifications
    nitrogenClassification: classifications.nitrogen.classification,
    nitrogenClassificationEn: classifications.nitrogen.classificationEn,
    nitrogenLabel: classifications.nitrogen.label,
    nitrogenLabelEn: classifications.nitrogen.labelEn,

    // Phosphorus classifications
    phosphorusClassification: classifications.phosphorus.classification,
    phosphorusClassificationEn: classifications.phosphorus.classificationEn,
    phosphorusLabel: classifications.phosphorus.label,
    phosphorusLabelEn: classifications.phosphorus.labelEn,

    // Potash classifications
    potashClassification: classifications.potash.classification,
    potashClassificationEn: classifications.potash.classificationEn,
    potashLabel: classifications.potash.label,
    potashLabelEn: classifications.potash.labelEn
  };
}

module.exports = {
  soilTestingRulebook,
  classifyParameter,
  processSoilTest,
  addClassifications
};
