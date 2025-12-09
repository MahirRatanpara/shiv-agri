/**
 * Script to create a sample PDF template with form fields
 * Run with: node create-template.js
 * Requires: npm install pdf-lib
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createTemplate() {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size in points
  const { width, height } = page.getSize();

  // Embed standard fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;
  const margin = 50;
  const labelX = margin;
  const fieldX = margin + 150;
  const fieldWidth = 200;
  const lineHeight = 25;

  // Helper function to add a section header
  function addSectionHeader(text, yPos) {
    page.drawRectangle({
      x: 0,
      y: yPos - 5,
      width: width,
      height: 25,
      color: rgb(0.15, 0.4, 0.9),
    });
    page.drawText(text, {
      x: margin,
      y: yPos,
      size: 14,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    return yPos - 30;
  }

  // Helper function to add a form field
  function addFormField(label, fieldName, yPos, multiline = false) {
    page.drawText(label + ':', {
      x: labelX,
      y: yPos,
      size: 11,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
    });

    const textField = form.createTextField(fieldName);
    textField.setText('');

    if (multiline) {
      textField.addToPage(page, {
        x: fieldX,
        y: yPos - 40,
        width: width - fieldX - margin,
        height: 60,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
      });
      return yPos - 70;
    } else {
      textField.addToPage(page, {
        x: fieldX,
        y: yPos - 5,
        width: fieldWidth,
        height: 18,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
      });
      return yPos - lineHeight;
    }
  }

  // Get the form
  const form = pdfDoc.getForm();

  // ===== HEADER =====
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width: width,
    height: 80,
    color: rgb(0.15, 0.4, 0.9),
  });

  page.drawText('SHIV AGRI - SOIL TESTING LABORATORY', {
    x: width / 2 - 180,
    y: height - 40,
    size: 18,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('Soil Testing Report', {
    x: width / 2 - 70,
    y: height - 65,
    size: 13,
    font: font,
    color: rgb(1, 1, 1),
  });

  y = height - 100;

  // Session info
  page.drawText('Session:', { x: margin, y, size: 10, font: font });
  const sessionDateField = form.createTextField('sessionDate');
  sessionDateField.addToPage(page, {
    x: margin + 50,
    y: y - 5,
    width: 100,
    height: 15,
    borderWidth: 0.5,
  });

  page.drawText('Version:', { x: margin + 160, y, size: 10, font: font });
  const sessionVersionField = form.createTextField('sessionVersion');
  sessionVersionField.addToPage(page, {
    x: margin + 210,
    y: y - 5,
    width: 50,
    height: 15,
    borderWidth: 0.5,
  });

  page.drawText('Generated:', { x: width - margin - 200, y, size: 10, font: font });
  const generatedDateField = form.createTextField('generatedDate');
  generatedDateField.addToPage(page, {
    x: width - margin - 130,
    y: y - 5,
    width: 70,
    height: 15,
    borderWidth: 0.5,
  });

  const generatedTimeField = form.createTextField('generatedTime');
  generatedTimeField.addToPage(page, {
    x: width - margin - 55,
    y: y - 5,
    width: 55,
    height: 15,
    borderWidth: 0.5,
  });

  y -= 35;

  // ===== FARMER INFORMATION =====
  y = addSectionHeader('FARMER INFORMATION', y);
  y = addFormField("Farmer's Name", 'farmersName', y);
  y = addFormField('Mobile No', 'mobileNo', y);
  y = addFormField('Location', 'location', y);
  y = addFormField("Farm's Name", 'farmsName', y);
  y = addFormField('Taluka', 'taluka', y);
  y -= 15;

  // ===== SOIL TEST MEASUREMENTS =====
  y = addSectionHeader('SOIL TEST MEASUREMENTS', y);
  y = addFormField('pH Level', 'ph', y);
  y = addFormField('EC', 'ec', y);
  y = addFormField('OC Blank', 'ocBlank', y);
  y = addFormField('OC Start', 'ocStart', y);
  y = addFormField('OC End', 'ocEnd', y);
  y = addFormField('P2O5 R', 'p2o5R', y);
  y = addFormField('K2O R', 'k2oR', y);
  y -= 15;

  // ===== CALCULATED RESULTS =====
  y = addSectionHeader('CALCULATED RESULTS', y);

  // Add light green background for calculated fields
  page.drawRectangle({
    x: fieldX - 5,
    y: y - 125,
    width: fieldWidth + 10,
    height: 135,
    color: rgb(0.94, 0.99, 0.96),
  });

  y = addFormField('OC Difference', 'ocDifference', y);
  y = addFormField('OC Percentage', 'ocPercent', y);
  y = addFormField('P2O5', 'p2o5', y);
  y = addFormField('K2O', 'k2o', y);
  y = addFormField('Organic Matter', 'organicMatter', y);
  y -= 15;

  // ===== CROP & RECOMMENDATIONS =====
  y = addSectionHeader('CROP & RECOMMENDATIONS', y);
  y = addFormField('Crop Name', 'cropName', y);
  y -= 10;
  y = addFormField('Final Deduction', 'finalDeduction', y, true);

  // ===== FOOTER =====
  page.drawText('Shiv Agri - Soil Testing Lab', {
    x: width / 2 - 80,
    y: 30,
    size: 9,
    font: font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Save the PDF
  const pdfBytes = await pdfDoc.save();

  // Create directory if it doesn't exist
  const outputDir = path.join(__dirname, 'frontend', 'src', 'assets', 'templates');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to file
  const outputPath = path.join(outputDir, 'soil-test-template.pdf');
  fs.writeFileSync(outputPath, pdfBytes);

  console.log('✅ PDF template created successfully!');
  console.log(`📄 Location: ${outputPath}`);
  console.log('\nThe template includes the following form fields:');
  console.log('- Farmer Information: farmersName, mobileNo, location, farmsName, taluka');
  console.log('- Measurements: ph, ec, ocBlank, ocStart, ocEnd, p2o5R, k2oR');
  console.log('- Calculated: ocDifference, ocPercent, p2o5, k2o, organicMatter');
  console.log('- Other: cropName, finalDeduction, sessionDate, sessionVersion');
  console.log('\nYou can now test the PDF generation by clicking the PDF button in the app!');
}

createTemplate().catch(err => {
  console.error('Error creating template:', err);
  process.exit(1);
});
