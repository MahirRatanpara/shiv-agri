# How to Create PDF Template with Form Fields

## Overview
The PDF generator expects a template PDF file with form fields (text fields) that will be automatically filled with data.

## Option 1: Using Adobe Acrobat Pro (Recommended)

1. **Create the PDF Layout:**
   - Design your soil testing report layout in any tool (Word, LibreOffice, etc.)
   - Add placeholder text where data should appear (e.g., "Farmer's Name: _______")
   - Export/Save as PDF

2. **Add Form Fields:**
   - Open the PDF in Adobe Acrobat Pro
   - Go to Tools → Prepare Form
   - Add text fields at the locations where data should appear
   - Name each field exactly as shown below

3. **Save the Template:**
   - Save as `soil-test-template.pdf`
   - Place it in `frontend/src/assets/templates/`

## Option 2: Using LibreOffice (Free Alternative)

1. **Create the Form:**
   - Open LibreOffice Writer
   - Design your report layout
   - Insert → Form → Text Box for each field
   - Right-click each text box → Control Properties → set the Name

2. **Export as PDF:**
   - File → Export as PDF
   - Check "Create PDF form" option
   - Save as `soil-test-template.pdf`

## Required Form Field Names

Your PDF template must have text fields with these exact names:

### Farmer Information
- `farmersName` - Farmer's Name
- `mobileNo` - Mobile Number
- `location` - Location
- `farmsName` - Farm's Name
- `taluka` - Taluka

### Soil Test Measurements
- `ph` - pH Level
- `ec` - EC (Electrical Conductivity)
- `ocBlank` - OC Blank
- `ocStart` - OC Start
- `ocEnd` - OC End
- `p2o5R` - P2O5 R
- `k2oR` - K2O R

### Calculated Results (Auto-filled)
- `ocDifference` - OC Difference
- `ocPercent` - OC Percentage
- `p2o5` - P2O5
- `k2o` - K2O
- `organicMatter` - Organic Matter

### Additional Fields
- `cropName` - Crop Name
- `finalDeduction` - Final Deduction (multi-line)
- `sessionDate` - Session Date
- `sessionVersion` - Session Version
- `generatedDate` - Generated Date
- `generatedTime` - Generated Time

## Template Layout Suggestion

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│           SHIV AGRI - SOIL TESTING LABORATORY               │
│                                                             │
│  Session: [sessionDate] - Version [sessionVersion]          │
│  Generated: [generatedDate] at [generatedTime]              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FARMER INFORMATION                                         │
│  ─────────────────                                          │
│  Farmer's Name:    [farmersName]                            │
│  Mobile No:        [mobileNo]                               │
│  Location:         [location]                               │
│  Farm's Name:      [farmsName]                              │
│  Taluka:           [taluka]                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SOIL TEST MEASUREMENTS                                     │
│  ─────────────────────                                      │
│  pH Level:         [ph]                                     │
│  EC:               [ec]                                     │
│  OC Blank:         [ocBlank]                                │
│  OC Start:         [ocStart]                                │
│  OC End:           [ocEnd]                                  │
│  P2O5 R:           [p2o5R]                                  │
│  K2O R:            [k2oR]                                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CALCULATED RESULTS                                         │
│  ──────────────────                                         │
│  OC Difference:    [ocDifference]                           │
│  OC Percentage:    [ocPercent]%                             │
│  P2O5:             [p2o5]                                   │
│  K2O:              [k2o]                                    │
│  Organic Matter:   [organicMatter]                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CROP & RECOMMENDATIONS                                     │
│  ──────────────────────                                     │
│  Crop Name:        [cropName]                               │
│                                                             │
│  Final Deduction:                                           │
│  [finalDeduction]                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start: Use the Provided Sample

If you don't want to create a template, the system will automatically fall back to generating a basic PDF without a template. However, for a professional look, creating a template is recommended.

## Testing Your Template

1. Place your template at: `frontend/src/assets/templates/soil-test-template.pdf`
2. Start your Angular app
3. Create a soil test entry
4. Click the PDF button
5. Check if all fields are filled correctly

## Troubleshooting

### "Template not found" error
- Ensure the file is at `frontend/src/assets/templates/soil-test-template.pdf`
- Check file permissions
- Verify the assets folder is included in angular.json

### Fields not filling
- Verify field names match exactly (case-sensitive)
- Ensure fields are text fields, not just text
- Check browser console for specific field errors

### Layout issues
- Use a fixed layout (not responsive)
- Recommended page size: A4 (210mm x 297mm)
- Use standard fonts (Arial, Times New Roman)

## Alternative: No Template Mode

If you don't provide a template, the system will generate a basic text-based PDF with all the information. This is functional but less visually appealing.

To use this mode, simply don't create a template file, and the fallback `generateBasicPdf()` method will be used automatically.
