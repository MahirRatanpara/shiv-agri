/**
 * Script to create sample Excel templates for Soil and Water Testing
 * Run: node src/scripts/create-sample-excel-templates.js
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function createSoilTestingTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Soil Testing Template');

  // Set column widths
  worksheet.columns = [
    { header: 'Sample Number', key: 'sampleNumber', width: 15 },
    { header: "Farmer's Name", key: 'farmersName', width: 25 },
    { header: 'Mobile No.', key: 'mobileNo', width: 15 },
    { header: 'Location', key: 'location', width: 20 },
    { header: "Farm's Name", key: 'farmsName', width: 20 },
    { header: 'Taluka', key: 'taluka', width: 15 }
  ];

  // Style the header row
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4CAF50' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 25;

  // Add sample data rows
  worksheet.addRow({
    sampleNumber: 'S001',
    farmersName: 'રાજેશભાઈ પટેલ',
    mobileNo: '9876543210',
    location: 'સૂરત',
    farmsName: 'પટેલ ફાર્મ',
    taluka: 'ચોરયાસી'
  });

  worksheet.addRow({
    sampleNumber: 'S002',
    farmersName: 'મહેશભાઈ શાહ',
    mobileNo: '9876543211',
    location: 'બારડોલી',
    farmsName: 'શાહ ફાર્મ',
    taluka: 'બારડોલી'
  });

  worksheet.addRow({
    sampleNumber: 'S003',
    farmersName: 'રમેશભાઈ દેસાઈ',
    mobileNo: '9876543212',
    location: 'કડોદ',
    farmsName: 'દેસાઈ ફાર્મ',
    taluka: 'કડોદ'
  });

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Add instructions in a separate sheet
  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.columns = [
    { width: 80 }
  ];

  instructionsSheet.addRow(['Soil Testing Excel Upload Instructions']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['How to use this template:']);
  instructionsSheet.addRow(['1. Fill in the data in the "Soil Testing Template" sheet']);
  instructionsSheet.addRow(['2. Required columns: Sample Number, Farmer\'s Name']);
  instructionsSheet.addRow(['3. Optional columns: Mobile No., Location, Farm\'s Name, Taluka']);
  instructionsSheet.addRow(['4. You can add as many rows as needed']);
  instructionsSheet.addRow(['5. If Sample Number already exists in the session, the row will be updated']);
  instructionsSheet.addRow(['6. If Sample Number does not exist, a new row will be added']);
  instructionsSheet.addRow(['7. After filling the data, save the file and upload it in the Soil Testing page']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['Column Descriptions:']);
  instructionsSheet.addRow(['- Sample Number: Unique identifier for the sample (required)']);
  instructionsSheet.addRow(['- Farmer\'s Name: Name of the farmer (required)']);
  instructionsSheet.addRow(['- Mobile No.: Contact number']);
  instructionsSheet.addRow(['- Location: Location of the farm']);
  instructionsSheet.addRow(['- Farm\'s Name: Name of the farm']);
  instructionsSheet.addRow(['- Taluka: Taluka/Tehsil name']);

  instructionsSheet.getRow(1).font = { bold: true, size: 14 };
  instructionsSheet.getRow(3).font = { bold: true };
  instructionsSheet.getRow(12).font = { bold: true };

  // Save the file
  const outputDir = path.join(__dirname, '..', '..', 'sample-excel-templates');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, 'Soil_Testing_Upload_Template.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log(`✅ Soil Testing template created: ${filePath}`);
}

async function createWaterTestingTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Water Testing Template');

  // Set column widths
  worksheet.columns = [
    { header: 'Sample Number', key: 'sampleNumber', width: 15 },
    { header: "Farmer's Name", key: 'farmersName', width: 25 },
    { header: 'Mobile No.', key: 'mobileNo', width: 15 },
    { header: 'Location', key: 'location', width: 20 },
    { header: "Farm's Name", key: 'farmsName', width: 20 },
    { header: 'Taluka', key: 'taluka', width: 15 },
    { header: 'Bore/Well', key: 'boreWellType', width: 12 }
  ];

  // Style the header row
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2196F3' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 25;

  // Add sample data rows
  worksheet.addRow({
    sampleNumber: 'W001',
    farmersName: 'રાજેશભાઈ પટેલ',
    mobileNo: '9876543210',
    location: 'સૂરત',
    farmsName: 'પટેલ ફાર્મ',
    taluka: 'ચોરયાસી',
    boreWellType: 'Bore'
  });

  worksheet.addRow({
    sampleNumber: 'W002',
    farmersName: 'મહેશભાઈ શાહ',
    mobileNo: '9876543211',
    location: 'બારડોલી',
    farmsName: 'શાહ ફાર્મ',
    taluka: 'બારડોલી',
    boreWellType: 'Well'
  });

  worksheet.addRow({
    sampleNumber: 'W003',
    farmersName: 'રમેશભાઈ દેસાઈ',
    mobileNo: '9876543212',
    location: 'કડોદ',
    farmsName: 'દેસાઈ ફાર્મ',
    taluka: 'કડોદ',
    boreWellType: 'Other'
  });

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Add instructions in a separate sheet
  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.columns = [
    { width: 80 }
  ];

  instructionsSheet.addRow(['Water Testing Excel Upload Instructions']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['How to use this template:']);
  instructionsSheet.addRow(['1. Fill in the data in the "Water Testing Template" sheet']);
  instructionsSheet.addRow(['2. Required columns: Sample Number, Farmer\'s Name']);
  instructionsSheet.addRow(['3. Optional columns: Mobile No., Location, Farm\'s Name, Taluka, Bore/Well']);
  instructionsSheet.addRow(['4. You can add as many rows as needed']);
  instructionsSheet.addRow(['5. If Sample Number already exists in the session, the row will be updated']);
  instructionsSheet.addRow(['6. If Sample Number does not exist, a new row will be added']);
  instructionsSheet.addRow(['7. After filling the data, save the file and upload it in the Water Testing page']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['Column Descriptions:']);
  instructionsSheet.addRow(['- Sample Number: Unique identifier for the sample (required)']);
  instructionsSheet.addRow(['- Farmer\'s Name: Name of the farmer (required)']);
  instructionsSheet.addRow(['- Mobile No.: Contact number']);
  instructionsSheet.addRow(['- Location: Location of the farm']);
  instructionsSheet.addRow(['- Farm\'s Name: Name of the farm']);
  instructionsSheet.addRow(['- Taluka: Taluka/Tehsil name']);
  instructionsSheet.addRow(['- Bore/Well: Type of water source (Bore, Well, or Other)']);

  instructionsSheet.getRow(1).font = { bold: true, size: 14 };
  instructionsSheet.getRow(3).font = { bold: true };
  instructionsSheet.getRow(12).font = { bold: true };

  // Save the file
  const outputDir = path.join(__dirname, '..', '..', 'sample-excel-templates');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, 'Water_Testing_Upload_Template.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log(`✅ Water Testing template created: ${filePath}`);
}

async function main() {
  try {
    console.log('Creating sample Excel templates...\n');
    await createSoilTestingTemplate();
    await createWaterTestingTemplate();
    console.log('\n✅ All templates created successfully!');
    console.log('\nTemplates are available in: backend/sample-excel-templates/');
  } catch (error) {
    console.error('❌ Error creating templates:', error);
    process.exit(1);
  }
}

main();
