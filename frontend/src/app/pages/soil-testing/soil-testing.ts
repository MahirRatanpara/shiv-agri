import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  CellValueChangedEvent,
  ModuleRegistry,
} from 'ag-grid-community';
import { SoilTestingService, Session, SoilTestingData } from '../../services/soil-testing.service';
import { PdfService } from '../../services/pdf.service';

@Component({
  selector: 'app-soil-testing',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  providers: [SoilTestingService, PdfService],
  templateUrl: './soil-testing.html',
  styleUrls: ['./soil-testing.css'],
})
export class SoilTestingComponent implements OnInit {
  private gridApi!: GridApi;

  // Session Management
  currentSession: Session | null = null;
  sessionActive: boolean = false;
  allSessions: Session[] = [];
  currentDate = new Date();
  todaySessionCount: number = 0;
  isBackendConnected: boolean = false;
  isLoading: boolean = true;

  // Pagination for session history
  currentPage: number = 1;
  pageSize: number = 10;
  totalPages: number = 0;

  get paginatedSessions(): Session[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.allSessions.slice(startIndex, endIndex);
  }

  // Column Definitions
  colDefs: ColDef<SoilTestingData>[] = [
    {
      field: 'farmersName',
      headerName: "Farmer's Name",
      editable: true,
      filter: true,
      minWidth: 180,
      flex: 0,
      pinned: 'left',
      autoHeight: true,
      wrapText: true,
      checkboxSelection: true,
      headerCheckboxSelection: true,
    },
    {
      field: 'mobileNo',
      headerName: 'Mobile No.',
      editable: true,
      filter: true,
      minWidth: 140,
    },
    {
      field: 'location',
      headerName: 'Location',
      editable: true,
      filter: true,
      minWidth: 150,
    },
    {
      field: 'farmsName',
      headerName: "Farm's Name",
      editable: true,
      filter: true,
      minWidth: 150,
    },
    {
      field: 'taluka',
      headerName: 'Taluka',
      editable: true,
      filter: true,
      minWidth: 120,
    },
    {
      field: 'ph',
      headerName: 'PH',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 100,
      cellClass: 'editable-number',
    },
    {
      field: 'ec',
      headerName: 'EC',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 100,
      cellClass: 'editable-number',
    },
    {
      field: 'ocBlank',
      headerName: 'OC Blank',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 120,
      cellClass: 'editable-number',
    },
    {
      field: 'ocStart',
      headerName: 'OC Start',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 120,
      cellClass: 'editable-number',
    },
    {
      field: 'ocEnd',
      headerName: 'OC End',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 120,
      cellClass: 'editable-number',
    },
    {
      field: 'p2o5R',
      headerName: 'P2O5 R',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'editable-number',
    },
    {
      field: 'k2oR',
      headerName: 'K2O R',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'editable-number',
    },
    {
      field: 'ocDifference',
      headerName: 'OC Difference',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 150,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const ocEnd = params.data?.ocEnd;
        const ocStart = params.data?.ocStart;
        // OC diff = OC end - OC start
        if (ocEnd !== null && ocEnd !== undefined && ocStart !== null && ocStart !== undefined) {
          return parseFloat((ocEnd - ocStart).toFixed(4));
        }
        return null;
      },
    },
    {
      field: 'ocPercent',
      headerName: 'OC%',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const ocBlank = params.data?.ocBlank;
        const ocDifference = params.getValue('ocDifference');
        // OC per = (ocBlank - ocDiff) * 3 / ocBlank
        if (
          ocBlank !== null &&
          ocBlank !== undefined &&
          ocBlank !== 0 &&
          ocDifference !== null &&
          ocDifference !== undefined
        ) {
          return parseFloat((((ocBlank - ocDifference) * 3) / ocBlank).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'p2o5',
      headerName: 'P2O5',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const p2o5R = params.data?.p2o5R;
        // p2o5 = P2O5 R * 2
        if (p2o5R !== null && p2o5R !== undefined) {
          return parseFloat((p2o5R * 2).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'k2o',
      headerName: 'K2O',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const k2oR = params.data?.k2oR;
        // k2o = k2oR * 5
        if (k2oR !== null && k2oR !== undefined) {
          return parseFloat((k2oR * 5).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'organicMatter',
      headerName: 'Organic Matter',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 160,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const ocPercent = params.getValue('ocPercent');
        // organic matter = ocPer * 1.724
        if (ocPercent !== null && ocPercent !== undefined) {
          return parseFloat((ocPercent * 1.724).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'cropName',
      headerName: 'Crop Name',
      editable: true,
      filter: true,
      minWidth: 140,
    },
    {
      field: 'finalDeduction',
      headerName: 'Final Deduction',
      editable: true,
      filter: true,
      minWidth: 200,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
    },
    {
      headerName: 'Actions',
      cellRenderer: (params: any) => {
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-pdf-action';
        button.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
        button.addEventListener('click', () => this.downloadSinglePdf(params.data));
        return button;
      },
      minWidth: 120,
      maxWidth: 120,
      pinned: 'right',
      sortable: false,
      filter: false,
    },
  ];

  // Default column definitions
  defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    autoHeaderHeight: true,
    wrapHeaderText: true,
  };

  // Row Data
  rowData: SoilTestingData[] = [];

  constructor(
    private soilTestingService: SoilTestingService,
    private pdfService: PdfService
  ) {
    console.log('SoilTestingComponent: Constructor called');
    console.log('SoilTestingService injected:', this.soilTestingService);
  }

  ngOnInit(): void {
    console.log('SoilTestingComponent: ngOnInit called');
    // Check backend connectivity first
    this.checkBackendConnection();
  }

  checkBackendConnection() {
    console.log('SoilTestingComponent: checkBackendConnection called');
    this.isLoading = true;
    console.log('SoilTestingComponent: About to call getTodaySessionCount');
    this.soilTestingService.getTodaySessionCount().subscribe({
      next: (response) => {
        console.log('SoilTestingComponent: getTodaySessionCount success:', response);
        this.isBackendConnected = true;
        this.todaySessionCount = response.count;
        this.isLoading = false;
        // Load all sessions after confirming connection
        this.loadSessions();
      },
      error: (error) => {
        console.error('Backend connection failed:', error);
        this.isBackendConnected = false;
        this.isLoading = false;
      }
    });
  }

  loadSessions() {
    this.soilTestingService.getAllSessions().subscribe({
      next: (sessions) => {
        this.allSessions = sessions;
        this.totalPages = Math.ceil(sessions.length / this.pageSize);
        console.log('Loaded sessions:', sessions);
      },
      error: (error) => {
        console.error('Error loading sessions:', error);
        this.isBackendConnected = false;
      }
    });
  }

  resumeSession(session: Session) {
    this.currentSession = session;
    this.sessionActive = true;
    this.rowData = session.data || [];
    console.log('Resumed session:', session);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  loadTodaySessionCount() {
    this.soilTestingService.getTodaySessionCount().subscribe({
      next: (response) => {
        this.todaySessionCount = response.count;
        console.log('Today session count:', response.count);
      },
      error: (error) => {
        console.error('Error loading today session count:', error);
        this.isBackendConnected = false;
      }
    });
  }

  startNewSession() {
    if (!this.isBackendConnected) {
      alert('Cannot start session: Backend server is not connected. Please ensure the server is running on http://localhost:3000');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const version = this.todaySessionCount + 1;

    const newSession = {
      date: today,
      version: version,
      startTime: new Date().toISOString(),
      data: []
    };

    console.log('Creating new session:', newSession);

    this.soilTestingService.createSession(newSession).subscribe({
      next: (session) => {
        console.log('Session created successfully:', session);
        this.currentSession = session;
        this.sessionActive = true;
        this.rowData = [];
        this.todaySessionCount = version;
      },
      error: (error) => {
        console.error('Error creating session:', error);
        alert('Failed to create session. Error: ' + (error.message || 'Unknown error'));
        this.isBackendConnected = false;
      }
    });
  }

  saveAndExit() {
    if (!this.currentSession || !this.currentSession._id) {
      alert('No active session to save');
      return;
    }

    // Get all row data from the grid with calculated values
    const allGridData: SoilTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
      endTime: null as any, // Explicitly remove endTime to mark as in-progress
      data: allGridData
    };

    console.log('Saving session:', this.currentSession._id, 'with', allGridData.length, 'records (Marked as In Progress)');

    this.soilTestingService.updateSession(this.currentSession._id, updates).subscribe({
      next: (session) => {
        console.log('Session saved successfully. Data saved:', session.data?.length, 'records (In Progress)');

        // Update the session in allSessions array
        const index = this.allSessions.findIndex(s => s._id === session._id);
        if (index !== -1) {
          this.allSessions[index] = session;
        } else {
          this.allSessions.unshift(session);
        }

        this.currentSession = null;
        this.sessionActive = false;
        this.rowData = [];

        // Reload sessions from backend to ensure sync
        this.loadSessions();
        this.loadTodaySessionCount();
      },
      error: (error) => {
        console.error('Error saving session:', error);
        alert('Failed to save session. Error: ' + (error.message || 'Unknown error'));
      }
    });
  }

  completeSession() {
    if (!this.currentSession || !this.currentSession._id) {
      alert('No active session to complete');
      return;
    }

    // Get all row data from the grid with calculated values
    const allGridData: SoilTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
      endTime: new Date().toISOString(),
      data: allGridData
    };

    console.log('Completing session:', this.currentSession._id, 'with', allGridData.length, 'records');

    this.soilTestingService.updateSession(this.currentSession._id, updates).subscribe({
      next: (session) => {
        console.log('Session completed successfully. Data saved:', session.data?.length, 'records');

        // Update the session in allSessions array
        const index = this.allSessions.findIndex(s => s._id === session._id);
        if (index !== -1) {
          this.allSessions[index] = session;
        } else {
          this.allSessions.unshift(session);
        }

        this.currentSession = null;
        this.sessionActive = false;
        this.rowData = [];

        // Reload sessions from backend to ensure sync
        this.loadSessions();
        this.loadTodaySessionCount();
      },
      error: (error) => {
        console.error('Error completing session:', error);
        alert('Failed to complete session. Error: ' + (error.message || 'Unknown error'));
      }
    });
  }

  getTodaySessionCount(): number {
    return this.todaySessionCount;
  }

  getFormattedDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  onGridReady(params: GridReadyEvent) {
    this.gridApi = params.api;
    // Auto-size all columns based on content
    params.api.autoSizeAllColumns(false);
  }

  onCellValueChanged(event: CellValueChangedEvent) {
    // Sync changes back to rowData array
    const rowIndex = event.node.rowIndex;
    if (rowIndex !== null && rowIndex !== undefined) {
      this.rowData[rowIndex] = event.data;
    }

    const colId = event.column.getColId();

    // When a cell value changes, refresh the row to recalculate computed values
    if (colId === 'ocBlank' || colId === 'ocEnd' || colId === 'ocStart') {
      // These affect OC Difference, OC%, and Organic Matter
      event.api.refreshCells({
        rowNodes: [event.node],
        columns: ['ocDifference', 'ocPercent', 'organicMatter'],
        force: true,
      });
    } else if (colId === 'p2o5R') {
      // This affects P2O5
      event.api.refreshCells({
        rowNodes: [event.node],
        columns: ['p2o5'],
        force: true,
      });
    } else if (colId === 'k2oR') {
      // This affects K2O
      event.api.refreshCells({
        rowNodes: [event.node],
        columns: ['k2o'],
        force: true,
      });
    }

    // Auto-resize the column that was edited
    event.api.autoSizeColumns([colId], false);
  }

  addNewRow() {
    const newRow: SoilTestingData = {
      farmersName: '',
      mobileNo: '',
      location: '',
      farmsName: '',
      taluka: '',
      ph: null,
      ec: null,
      ocBlank: null,
      ocStart: null,
      ocEnd: null,
      p2o5R: null,
      k2oR: null,
      ocDifference: null,
      ocPercent: null,
      p2o5: null,
      k2o: null,
      organicMatter: null,
      cropName: '',
      finalDeduction: '',
    };

    // Add to rowData array and grid
    this.rowData.push(newRow);
    this.gridApi.applyTransaction({ add: [newRow] });
    console.log('Added new row. Total rows:', this.rowData.length);
  }

  deleteSelectedRows() {
    const selectedRows = this.gridApi.getSelectedRows();
    if (selectedRows.length > 0) {
      // Remove from rowData array
      selectedRows.forEach(row => {
        const index = this.rowData.indexOf(row);
        if (index > -1) {
          this.rowData.splice(index, 1);
        }
      });
      this.gridApi.applyTransaction({ remove: selectedRows });
      console.log('Deleted rows. Remaining rows:', this.rowData.length);
    }
  }

  exportToCsv() {
    this.gridApi.exportDataAsCsv({
      fileName: `soil-testing-${new Date().toISOString().split('T')[0]}.csv`,
    });
  }

  /**
   * Extract all row data from grid including calculated values
   */
  private extractGridDataWithCalculatedValues(): SoilTestingData[] {
    const allGridData: SoilTestingData[] = [];
    this.gridApi.forEachNode(node => {
      if (node.data) {
        // Get all values from the grid to ensure we capture popup editor changes
        const completeData: SoilTestingData = {
          farmersName: this.gridApi.getValue('farmersName', node) || '',
          mobileNo: this.gridApi.getValue('mobileNo', node) || '',
          location: this.gridApi.getValue('location', node) || '',
          farmsName: this.gridApi.getValue('farmsName', node) || '',
          taluka: this.gridApi.getValue('taluka', node) || '',
          ph: this.gridApi.getValue('ph', node) ?? null,
          ec: this.gridApi.getValue('ec', node) ?? null,
          ocBlank: this.gridApi.getValue('ocBlank', node) ?? null,
          ocStart: this.gridApi.getValue('ocStart', node) ?? null,
          ocEnd: this.gridApi.getValue('ocEnd', node) ?? null,
          p2o5R: this.gridApi.getValue('p2o5R', node) ?? null,
          k2oR: this.gridApi.getValue('k2oR', node) ?? null,
          ocDifference: this.gridApi.getValue('ocDifference', node) ?? null,
          ocPercent: this.gridApi.getValue('ocPercent', node) ?? null,
          p2o5: this.gridApi.getValue('p2o5', node) ?? null,
          k2o: this.gridApi.getValue('k2o', node) ?? null,
          organicMatter: this.gridApi.getValue('organicMatter', node) ?? null,
          cropName: this.gridApi.getValue('cropName', node) || '',
          finalDeduction: this.gridApi.getValue('finalDeduction', node) || '',
        };

        // Debug logging for troubleshooting
        console.log('Extracted row data:', {
          farmersName: completeData.farmersName,
          cropName: completeData.cropName,
          finalDeduction: completeData.finalDeduction?.substring(0, 50),
          ocDifference: completeData.ocDifference,
          ocPercent: completeData.ocPercent,
          p2o5: completeData.p2o5,
          k2o: completeData.k2o,
          organicMatter: completeData.organicMatter
        });

        allGridData.push(completeData);
      }
    });

    console.log(`Extracted ${allGridData.length} rows with all fields`);
    return allGridData;
  }

  /**
   * Save current session data silently (without exiting)
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession || !this.currentSession._id) {
      return Promise.reject('No active session to save');
    }

    const allGridData: SoilTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
      data: allGridData
    };

    return new Promise((resolve, reject) => {
      this.soilTestingService.updateSession(this.currentSession!._id!, updates).subscribe({
        next: (session) => {
          console.log('Session auto-saved before PDF generation:', session.data?.length, 'records');
          // Update current session with saved data
          this.currentSession = session;
          this.rowData = session.data || [];
          resolve();
        },
        error: (error) => {
          console.error('Error auto-saving session:', error);
          reject(error);
        }
      });
    });
  }

  // ===== PDF GENERATION METHODS =====

  /**
   * Download PDF for a single row
   */
  async downloadSinglePdf(data: SoilTestingData) {
    try {
      console.log('📥 Starting PDF download - saving to database first...');

      // STEP 1: Save session to database and wait for completion
      await this.saveCurrentSession();
      console.log('✅ Database save complete. Proceeding with PDF generation...');

      // STEP 2: Find the saved sample with its database ID
      const savedRow = this.currentSession?.data?.find(row =>
        row.farmersName === data.farmersName && row.mobileNo === data.mobileNo
      ) || data;

      if (!savedRow._id) {
        throw new Error('Sample ID not found. Please save the data first.');
      }

      // STEP 3: Generate PDF from backend using sample ID
      const farmerName = savedRow.farmersName || 'Unknown';
      const filename = `જમીન ચકાસણી - ${farmerName}.pdf`;

      await this.pdfService.downloadSinglePDF(savedRow._id, filename);
      console.log('✅ PDF generated successfully for:', savedRow.farmersName);
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      alert('Failed to generate PDF report. Please check the console for details.');
    }
  }

  /**
   * Download all PDFs (individual files)
   */
  async downloadAllPdfs() {
    if (this.rowData.length === 0) {
      alert('No data available to generate reports');
      return;
    }

    try {
      console.log('📥 Starting bulk PDF download - saving to database first...');

      // STEP 1: Save session to database and wait for completion
      await this.saveCurrentSession();
      console.log('✅ Database save complete. Proceeding with bulk PDF generation...');

      // STEP 2: Verify we have a session ID
      if (!this.currentSession?._id) {
        throw new Error('Session ID not found. Please save the session first.');
      }

      // STEP 3: Generate bulk PDFs using backend service
      await this.pdfService.downloadBulkSessionPDFs(this.currentSession._id);

      console.log(`✅ Successfully generated ${this.currentSession.data?.length || 0} PDF reports`);
    } catch (error) {
      console.error('❌ Error generating bulk PDFs:', error);
      alert('Failed to generate all PDF reports. Some reports may not have been downloaded.');
    }
  }

  /**
   * Download all data as a single combined PDF
   */
  async downloadCombinedPdf() {
    if (this.rowData.length === 0) {
      alert('No data available to generate reports');
      return;
    }

    try {
      console.log('📥 Starting combined PDF download - saving to database first...');

      // STEP 1: Save session to database and wait for completion
      await this.saveCurrentSession();
      console.log('✅ Database save complete. Proceeding with combined PDF generation...');

      // STEP 2: Verify we have a session ID
      if (!this.currentSession?._id) {
        throw new Error('Session ID not found. Please save the session first.');
      }

      // STEP 3: Generate combined PDF using backend service
      const filename = `જમીન ચકાસણી - Combined_${this.currentSession.date}_v${this.currentSession.version}.pdf`;
      await this.pdfService.downloadCombinedSessionPDF(this.currentSession._id, filename);

      console.log(`✅ Successfully generated combined PDF with ${this.currentSession.data?.length || 0} reports`);
    } catch (error) {
      console.error('❌ Error generating combined PDF:', error);
      alert('Failed to generate combined PDF report.');
    }
  }

  /**
   * Preview PDF in new tab (optional utility)
   */
  async previewPdf(data: SoilTestingData) {
    try {
      // Save to ensure we have the latest data with ID
      await this.saveCurrentSession();

      const savedRow = this.currentSession?.data?.find(row =>
        row.farmersName === data.farmersName && row.mobileNo === data.mobileNo
      ) || data;

      if (!savedRow._id) {
        throw new Error('Sample ID not found. Please save the data first.');
      }

      await this.pdfService.previewSinglePDF(savedRow._id);
    } catch (error) {
      console.error('Error previewing PDF:', error);
      alert('Failed to preview PDF report.');
    }
  }

}
