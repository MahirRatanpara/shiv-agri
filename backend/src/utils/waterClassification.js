/**
 * Water Testing Classification Rulebook
 * Classifies water parameters based on scientific ranges
 */

const waterTestingRulebook = {
  // 1. pH (પાણીનો રસાયણ)
  pH: {
    parameter: "pH",
    gujaratiName: "પાણીનો રસાયણ (pH)",
    ranges: [
      {
        min: 0,
        max: 6.99,
        classification: "એસિડિક",
        classificationEn: "Acidic"
      },
      {
        min: 7,
        max: 7,
        classification: "સામાન્ય",
        classificationEn: "Normal"
      },
      {
        min: 7.01,
        max: Infinity,
        classification: "ભસ્મિકતા",
        classificationEn: "Basic"
      }
    ]
  },

  // 2. EC (વીજવાહક ક્ષમતા) - Salinity Classification
  // Note: EC value is multiplied by 1000 for classification (micromhos)
  EC: {
    parameter: "EC",
    gujaratiName: "વીજવાહક ક્ષમતા (EC)",
    unit: "(dS/m)",
    ranges: [
      {
        min: 0,
        max: 0.25,
        classification: "સામાન્ય",
        classificationEn: "Normal",
        classCode: "C₁"
      },
      {
        min: 0.25,
        max: 0.75,
        classification: "મધ્યમ ક્ષાર",
        classificationEn: "Medium Salinity",
        classCode: "C₂"
      },
      {
        min: 0.75,
        max: 2.2,
        classification: "વધારે ક્ષાર",
        classificationEn: "High Salinity",
        classCode: "C₃"
      },
      {
        min: 2.2,
        max: 5,
        classification: "ખૂબજ ક્ષાર",
        classificationEn: "Very High Salinity",
        classCode: "C₄"
      },
      {
        min: 5,
        max: Infinity,
        classification: "અતિશય ક્ષાર",
        classificationEn: "Extreme Salinity",
        classCode: "C₄"
      }
    ]
  },

  // EC classification based on micromhos (for class code determination)
  EC_micromhos: {
    parameter: "EC",
    ranges: [
      {
        min: 0,
        max: 250,
        classCode: "C₁"
      },
      {
        min: 250,
        max: 750,
        classCode: "C₂"
      },
      {
        min: 750,
        max: 2250,
        classCode: "C₃"
      },
      {
        min: 2250,
        max: Infinity,
        classCode: "C₄"
      }
    ]
  },

  // 3. SAR (Sodium Adsorption Ratio) Classification
  SAR: {
    parameter: "SAR",
    gujaratiName: "સોડિયમ એડસોર્પશન રેશિયો (SAR)",
    ranges: [
      {
        min: 0,
        max: 10,
        classification: "પાક પર નહિવત અસર",
        classificationEn: "Negligible effect on crops",
        classCode: "S₁"
      },
      {
        min: 10,
        max: 18,
        classification: "પાક પર મધ્યમ અસર",
        classificationEn: "Medium effect on crops",
        classCode: "S₂"
      },
      {
        min: 18,
        max: 26,
        classification: "પાક પર વધારે અસર",
        classificationEn: "High effect on crops",
        classCode: "S₃"
      },
      {
        min: 26,
        max: Infinity,
        classification: "પાક પર અતિ વધારે અસર",
        classificationEn: "Very high effect on crops",
        classCode: "S₄"
      }
    ]
  },

  // 4. RSC (Residual Sodium Carbonate) Classification
  RSC: {
    parameter: "RSC",
    gujaratiName: "રેસિડ્યુઅલ સોડિયમ કાર્બોનેટ (RSC)",
    unit: "(meq/lit)",
    ranges: [
      {
        min: -Infinity,
        max: 1.25,
        classification: "સલામત",
        classificationEn: "Safe",
        classCode: "R₁"
      },
      {
        min: 1.25,
        max: 2.50,
        classification: "મધ્યમ અસર",
        classificationEn: "Medium effect",
        classCode: "R₂"
      },
      {
        min: 2.50,
        max: Infinity,
        classification: "વધારે અસર",
        classificationEn: "High effect",
        classCode: "R₃"
      }
    ]
  }
};

/**
 * Classify a parameter value based on the rulebook
 * @param {string} parameterType - Type of parameter (pH, EC, SAR, RSC)
 * @param {number} value - The measured value
 * @returns {object} Classification result with gujarati and english labels
 */
function classifyParameter(parameterType, value) {
  const rules = waterTestingRulebook[parameterType];

  if (!rules) {
    return {
      classification: "",
      classificationEn: "",
      classCode: ""
    };
  }

  // Handle null, undefined, or invalid values
  if (value === null || value === undefined || isNaN(value)) {
    return {
      classification: "",
      classificationEn: "",
      classCode: ""
    };
  }

  // Handle negative values (except for RSC which can be negative)
  if (value < 0 && parameterType !== 'RSC') {
    return {
      classification: "અયોગ્ય મૂલ્ય",
      classificationEn: "Invalid value",
      classCode: ""
    };
  }

  // Find the appropriate range
  for (const range of rules.ranges) {
    if (value >= range.min && value <= range.max) {
      return {
        classification: range.classification || "",
        classificationEn: range.classificationEn || "",
        classCode: range.classCode || ""
      };
    }
  }

  return {
    classification: "",
    classificationEn: "",
    classCode: ""
  };
}

/**
 * Get EC class code based on micromhos value
 * @param {number} ecValue - EC value (will be multiplied by 1000)
 * @returns {string} Class code (C₁, C₂, C₃, C₄)
 */
function getECClassCode(ecValue) {
  if (ecValue === null || ecValue === undefined || isNaN(ecValue)) {
    return "";
  }

  // Convert EC to micromhos (multiply by 1000)
  const ecInMicromhos = ecValue * 1000;

  const rules = waterTestingRulebook.EC_micromhos;

  for (const range of rules.ranges) {
    if (ecInMicromhos >= range.min && ecInMicromhos <= range.max) {
      return range.classCode;
    }
  }

  return "";
}

/**
 * Process all water test parameters and return classifications
 * @param {object} waterTestData - Object containing all test values
 * @returns {object} Classified results for all parameters
 */
function processWaterTest(waterTestData) {
  const ecClassification = classifyParameter('EC', waterTestData.ec);
  const ecClassCode = getECClassCode(waterTestData.ec);

  return {
    pH: classifyParameter('pH', waterTestData.ph),
    EC: {
      ...ecClassification,
      classCode: ecClassCode
    },
    SAR: classifyParameter('SAR', waterTestData.sar),
    RSC: classifyParameter('RSC', waterTestData.rsc)
  };
}

/**
 * Generate final deduction based on EC and SAR class codes
 * @param {string} ecClass - EC class code (C₁, C₂, C₃, C₄)
 * @param {string} sarClass - SAR class code (S₁, S₂, S₃, S₄)
 * @returns {object} Final deduction in Gujarati and English
 */
function generateFinalDeduction(ecClass, sarClass) {
  // Handle invalid or missing values
  if (!ecClass || !sarClass) {
    return {
      finalDeduction: "",
      finalDeductionEn: ""
    };
  }

  const combination = `${ecClass}${sarClass}`;

  // Rule 1: C₁S₁ or C₂S₁ or C₂S₂ or C₁S₂
  if (['C₁S₁', 'C₂S₁', 'C₂S₂', 'C₁S₂'].includes(combination)) {
    return {
      finalDeduction: "પિયત માટે બધાજ પ્રકાર ના ખેત પાકો માટે લાયક ગણાય.",
      finalDeductionEn: "Suitable for irrigation of all types of field crops."
    };
  }

  // Rule 2: C₃S₁ or C₃S₂
  if (['C₃S₁', 'C₃S₂'].includes(combination)) {
    return {
      finalDeduction: "નિતાર વાળી જમીન માં પિયત માટે બધાજ પ્રકાર ના ખેત પાકો માટે લાયક ગણાય.",
      finalDeductionEn: "Suitable for irrigation of all types of field crops in well-drained soil."
    };
  }

  // Rule 3: C₄S₁ or C₄S₂
  if (['C₄S₁', 'C₄S₂'].includes(combination)) {
    return {
      finalDeduction: "પિયત માટે બધાજ પ્રકાર ના ખેત પાકો માટે લાયક ન ગણાય, પરંતુ ક્ષારીય પાણી ને સહન કરતા પાકો માટે વાપરી શકાય.",
      finalDeductionEn: "Not suitable for irrigation of all field crops, but can be used for salt-tolerant crops."
    };
  }

  // Rule 4: C₅S₁ or C₅S₂ (Note: We don't have C₅, but keeping for future)
  if (['C₅S₁', 'C₅S₂'].includes(combination)) {
    return {
      finalDeduction: "પિયત માટે લાયક ન ગણાય.",
      finalDeductionEn: "Not suitable for irrigation."
    };
  }

  // Default case - no specific recommendation
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
  const classifications = processWaterTest(sampleData);
  const deduction = generateFinalDeduction(
    classifications.EC.classCode,
    classifications.SAR.classCode
  );

  // Generate combined class (e.g., "C3S1", "C1S3")
  const combinedClass = (classifications.EC.classCode && classifications.SAR.classCode)
    ? `${classifications.EC.classCode}${classifications.SAR.classCode}`
    : '';

  return {
    ...sampleData,
    // Single result fields per parameter (Gujarati classification)
    phResult: classifications.pH.classification,
    ecResult: classifications.EC.classification,
    sarResult: classifications.SAR.classification,
    rscResult: classifications.RSC.classification,

    // English result fields
    phResultEn: classifications.pH.classificationEn,
    ecResultEn: classifications.EC.classificationEn,
    sarResultEn: classifications.SAR.classificationEn,
    rscResultEn: classifications.RSC.classificationEn,

    // Class codes
    ecClass: classifications.EC.classCode,
    sarClass: classifications.SAR.classCode,
    rscClass: classifications.RSC.classCode,

    // Combined class (e.g., "C3S1")
    waterClass: combinedClass,

    // Final deduction
    finalDeduction: deduction.finalDeduction,
    finalDeductionEn: deduction.finalDeductionEn
  };
}

module.exports = {
  waterTestingRulebook,
  classifyParameter,
  processWaterTest,
  addClassifications,
  getECClassCode,
  generateFinalDeduction
};
