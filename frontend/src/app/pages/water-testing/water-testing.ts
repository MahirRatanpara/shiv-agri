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
import { WaterTestingService, Session, WaterTestingData } from '../../services/water-testing.service';
import { PdfService } from '../../services/pdf.service';
import { ToastService } from '../../services/toast.service';
import { HasPermissionDirective } from '../../directives/has-permission.directive';

@Component({
  selector: 'app-water-testing',
  standalone: true,
  imports: [CommonModule, AgGridAngular, HasPermissionDirective],
  providers: [WaterTestingService, PdfService],
  templateUrl: './water-testing.html',
  styleUrls: ['./water-testing.css'],
})
export class WaterTestingComponent implements OnInit {
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
  colDefs: ColDef<WaterTestingData>[] = [
    {
      headerName: '',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      width: 50,
      minWidth: 50,
      maxWidth: 50,
      pinned: 'left',
      lockPosition: true,
      suppressMovable: true,
      sortable: false,
      filter: false,
      resizable: false,
    },
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
      field: 'boreWellType',
      headerName: 'Bore/Well',
      editable: true,
      filter: true,
      minWidth: 140,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['Bore', 'Well', 'Other']
      },
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
      field: 'caMgBlank',
      headerName: 'Ca+Mg Blank',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 140,
      cellClass: 'editable-number',
    },
    {
      field: 'caMgStart',
      headerName: 'Ca+Mg Start',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 140,
      cellClass: 'editable-number',
    },
    {
      field: 'caMgEnd',
      headerName: 'Ca+Mg End',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 130,
      cellClass: 'editable-number',
    },
    {
      field: 'caMgDifference',
      headerName: 'Ca+Mg Diff',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 130,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const end = params.data?.caMgEnd;
        const start = params.data?.caMgStart;
        if (end !== null && end !== undefined && start !== null && start !== undefined) {
          return parseFloat((end - start).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'caMg',
      headerName: 'Ca+Mg',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 120,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const end = params.data?.caMgEnd;
        const start = params.data?.caMgStart;
        const blank = params.data?.caMgBlank;
        if (end !== null && end !== undefined && start !== null && start !== undefined &&
            blank !== null && blank !== undefined) {
          const diff = end - start;
          return parseFloat(((diff - blank) * 2).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'na',
      headerName: 'Na',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 100,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const ec = params.data?.ec;
        const end = params.data?.caMgEnd;
        const start = params.data?.caMgStart;
        const blank = params.data?.caMgBlank;

        if (ec !== null && ec !== undefined &&
            end !== null && end !== undefined &&
            start !== null && start !== undefined &&
            blank !== null && blank !== undefined) {
          const diff = end - start;
          const calculatedCaMg = (diff - blank) * 2;
          return parseFloat((ec * 10 - calculatedCaMg).toFixed(2));
        }
        return null;
      },
    },
    {
      field: 'sar',
      headerName: 'SAR',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const ec = params.data?.ec;
        const end = params.data?.caMgEnd;
        const start = params.data?.caMgStart;
        const blank = params.data?.caMgBlank;

        if (ec !== null && ec !== undefined &&
            end !== null && end !== undefined &&
            start !== null && start !== undefined &&
            blank !== null && blank !== undefined) {
          const diff = end - start;
          const calculatedCaMg = (diff - blank) * 2;
          const calculatedNa = ec * 10 - calculatedCaMg;

          const denominator = calculatedCaMg / 2;
          if (denominator > 0) {
            return parseFloat((calculatedNa / Math.sqrt(denominator)).toFixed(2));
          }
        }
        return null;
      },
    },
    {
      field: 'waterClass',
      headerName: 'CLASS',
      editable: false,
      filter: true,
      minWidth: 140,
    },
    {
      field: 'co3Hco3',
      headerName: 'CO3+HCO3',
      editable: true,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 140,
      cellClass: 'editable-number',
    },
    {
      field: 'rsc',
      headerName: 'RSC',
      editable: false,
      filter: 'agNumberColumnFilter',
      cellDataType: 'number',
      minWidth: 110,
      cellClass: 'calculated-cell',
      valueGetter: (params) => {
        const co3Hco3 = params.data?.co3Hco3;
        const end = params.data?.caMgEnd;
        const start = params.data?.caMgStart;
        const blank = params.data?.caMgBlank;

        if (co3Hco3 !== null && co3Hco3 !== undefined &&
            end !== null && end !== undefined &&
            start !== null && start !== undefined &&
            blank !== null && blank !== undefined) {
          const diff = end - start;
          const calculatedCaMg = (diff - blank) * 2;
          return parseFloat((co3Hco3 - calculatedCaMg).toFixed(2));
        }
        return null;
      },
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
  rowData: WaterTestingData[] = [];

  constructor(
    private waterTestingService: WaterTestingService,
    private pdfService: PdfService,
    private toastService: ToastService
  ) {


  }

  ngOnInit(): void {

    // Check backend connectivity first
    this.checkBackendConnection();
  }

  checkBackendConnection() {

    this.isLoading = true;

    this.waterTestingService.getTodaySessionCount().subscribe({
      next: (response) => {

        this.isBackendConnected = true;
        this.todaySessionCount = response.count;
        this.isLoading = false;
        // Load all sessions after confirming connection
        this.loadSessions();
      },
      error: (error) => {

        this.isBackendConnected = false;
        this.isLoading = false;
      }
    });
  }

  loadSessions() {
    this.waterTestingService.getAllSessions().subscribe({
      next: (sessions) => {
        this.allSessions = sessions;
        this.totalPages = Math.ceil(sessions.length / this.pageSize);

      },
      error: (error) => {

        this.isBackendConnected = false;
      }
    });
  }

  resumeSession(session: Session) {
    this.currentSession = session;
    this.sessionActive = true;
    this.rowData = session.data || [];

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
    this.waterTestingService.getTodaySessionCount().subscribe({
      next: (response) => {
        this.todaySessionCount = response.count;

      },
      error: (error) => {

        this.isBackendConnected = false;
      }
    });
  }

  startNewSession() {
    if (!this.isBackendConnected) {
      this.toastService.show('Cannot start session: Backend server is not connected', 'error');
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


    this.waterTestingService.createSession(newSession).subscribe({
      next: (session) => {

        this.currentSession = session;
        this.sessionActive = true;
        this.rowData = [];
        this.todaySessionCount = version;
      },
      error: (error) => {

        this.toastService.show('Failed to create session: ' + (error.error?.error || error.message || 'Unknown error'), 'error');
        this.isBackendConnected = false;
      }
    });
  }

  saveAndExit() {
    if (!this.currentSession || !this.currentSession._id) {
      this.toastService.show('No active session to save', 'warning');
      return;
    }

    // Get all row data from the grid with calculated values
    const allGridData: WaterTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
      endTime: null as any, // Explicitly remove endTime to mark as in-progress
      data: allGridData
    };


    this.waterTestingService.updateSession(this.currentSession._id, updates).subscribe({
      next: (session) => {

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

        this.toastService.show('Failed to save session: ' + (error.error?.error || error.message || 'Unknown error'), 'error');
      }
    });
  }

  completeSession() {
    if (!this.currentSession || !this.currentSession._id) {
      this.toastService.show('No active session to complete', 'warning');
      return;
    }

    // Get all row data from the grid with calculated values
    const allGridData: WaterTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
      endTime: new Date().toISOString(),
      data: allGridData
    };


    this.waterTestingService.updateSession(this.currentSession._id, updates).subscribe({
      next: (session) => {

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

        this.toastService.show('Failed to complete session: ' + (error.error?.error || error.message || 'Unknown error'), 'error');
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

    // Ensure grid can scroll horizontally
    params.api.sizeColumnsToFit();
  }

  onCellValueChanged(event: CellValueChangedEvent) {
    // Sync changes back to rowData array
    const rowIndex = event.node.rowIndex;
    if (rowIndex !== null && rowIndex !== undefined) {
      this.rowData[rowIndex] = event.data;
    }

    const colId = event.column.getColId();

    // When a cell value changes, refresh the row to recalculate computed values
    if (colId === 'caMgStart' || colId === 'caMgEnd' || colId === 'caMgBlank') {
      // These affect Ca+Mg Difference, Ca+Mg, Na, SAR, and RSC
      event.api.refreshCells({
        rowNodes: [event.node],
        columns: ['caMgDifference', 'caMg', 'na', 'sar', 'rsc'],
        force: true,
      });
    } else if (colId === 'ec') {
      // EC affects Na and SAR
      event.api.refreshCells({
        rowNodes: [event.node],
        columns: ['na', 'sar'],
        force: true,
      });
    } else if (colId === 'co3Hco3') {
      // This affects RSC
      event.api.refreshCells({
        rowNodes: [event.node],
        columns: ['rsc'],
        force: true,
      });
    }

    // Auto-resize the column that was edited
    event.api.autoSizeColumns([colId], false);
  }

  addNewRow() {
    const newRow: WaterTestingData = {
      farmersName: '',
      mobileNo: '',
      location: '',
      farmsName: '',
      taluka: '',
      boreWellType: '',
      ph: null,
      ec: null,
      caMgBlank: null,
      caMgStart: null,
      caMgEnd: null,
      caMgDifference: null,
      caMg: null,
      na: null,
      sar: null,
      classification: '',
      co3Hco3: null,
      rsc: null,
      finalDeduction: '',
    };

    // Add to rowData array and grid
    this.rowData.push(newRow);
    this.gridApi.applyTransaction({ add: [newRow] });

    // Ensure horizontal scrolling is enabled after adding row
    setTimeout(() => {
      if (this.gridApi) {
        this.gridApi.ensureIndexVisible(this.rowData.length - 1);
      }
    }, 100);
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

    }
  }

  exportToCsv() {
    this.gridApi.exportDataAsCsv({
      fileName: `water-testing-${new Date().toISOString().split('T')[0]}.csv`,
    });
  }

  /**
   * Extract all row data from grid including calculated values
   */
  private extractGridDataWithCalculatedValues(): WaterTestingData[] {
    const allGridData: WaterTestingData[] = [];
    this.gridApi.forEachNode(node => {
      if (node.data) {
        // Get all values from the grid
        const completeData: WaterTestingData = {
          farmersName: this.gridApi.getValue('farmersName', node) || '',
          mobileNo: this.gridApi.getValue('mobileNo', node) || '',
          location: this.gridApi.getValue('location', node) || '',
          farmsName: this.gridApi.getValue('farmsName', node) || '',
          taluka: this.gridApi.getValue('taluka', node) || '',
          boreWellType: this.gridApi.getValue('boreWellType', node) || '',
          ph: this.gridApi.getValue('ph', node) ?? null,
          ec: this.gridApi.getValue('ec', node) ?? null,
          caMgBlank: this.gridApi.getValue('caMgBlank', node) ?? null,
          caMgStart: this.gridApi.getValue('caMgStart', node) ?? null,
          caMgEnd: this.gridApi.getValue('caMgEnd', node) ?? null,
          caMgDifference: this.gridApi.getValue('caMgDifference', node) ?? null,
          caMg: this.gridApi.getValue('caMg', node) ?? null,
          na: this.gridApi.getValue('na', node) ?? null,
          sar: this.gridApi.getValue('sar', node) ?? null,
          classification: this.gridApi.getValue('classification', node) || '',
          co3Hco3: this.gridApi.getValue('co3Hco3', node) ?? null,
          rsc: this.gridApi.getValue('rsc', node) ?? null,
          finalDeduction: this.gridApi.getValue('finalDeduction', node) || '',
        };

        allGridData.push(completeData);
      }
    });


    return allGridData;
  }

  /**
   * Save current session data silently (without exiting)
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession || !this.currentSession._id) {
      return Promise.reject('No active session to save');
    }

    const allGridData: WaterTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
      data: allGridData
    };

    return new Promise((resolve, reject) => {
      this.waterTestingService.updateSession(this.currentSession!._id!, updates).subscribe({
        next: (session) => {

          // Update current session with saved data
          this.currentSession = session;
          this.rowData = session.data || [];

          // Refresh the grid to update with new IDs from database
          if (this.gridApi) {
            this.gridApi.setGridOption('rowData', this.rowData);
          }

          resolve();
        },
        error: (error) => {

          reject(error);
        }
      });
    });
  }

  // ===== PDF GENERATION METHODS =====

  /**
   * Download PDF for a single row
   */
  async downloadSinglePdf(data: WaterTestingData) {
    try {
      // Show downloading toast
      this.toastService.info('📄 Preparing your water report... Please wait', 0);

      // Always save the current session first to ensure latest data is in database

      await this.saveCurrentSession();

      // After saving, get the updated row data with the correct _id
      // Find the row by matching farmer name and other identifiable fields
      const updatedRow = this.rowData.find(row =>
        row.farmersName === data.farmersName &&
        row.mobileNo === data.mobileNo
      );

      if (!updatedRow || !updatedRow._id) {
        this.toastService.clear();
        this.toastService.error('❌ Failed to save the sample. Please try again.', 5000);
        return;
      }


      const farmerName = updatedRow.farmersName || 'Unknown';
      const filename = `પાણી ચકાસણી - ${farmerName}.pdf`;
      await this.pdfService.downloadWaterSamplePDF(updatedRow._id, filename);

      // Clear all toasts and show success message
      this.toastService.clear();
      this.toastService.success(`✅ Water report for ${farmerName} downloaded successfully!`, 4000);
    } catch (error) {

      this.toastService.clear();
      this.toastService.error('❌ Failed to generate PDF report. Please try again.', 5000);
    }
  }

  /**
   * Download all PDFs individually (one by one with delay)
   */
  async downloadAllPdfs() {
    try {
      if (this.rowData.length === 0) {
        this.toastService.warning('⚠️ No data available to generate reports');
        return;
      }

      if (!this.currentSession || !this.currentSession._id) {
        this.toastService.warning('⚠️ Please save the session first before generating PDFs');
        return;
      }

      const totalReports = this.rowData.length;
      this.toastService.info(`📄 Generating ${totalReports} water reports... Please wait`, 0);


      await this.saveCurrentSession();

      await this.pdfService.downloadBulkWaterPDFs(this.currentSession._id);

      this.toastService.clear();
      this.toastService.success(`✅ All ${totalReports} water reports downloaded successfully!`, 5000);
    } catch (error) {

      this.toastService.clear();
      this.toastService.error('❌ Failed to generate all reports. Some reports may not have been downloaded.', 6000);
    }
  }

  /**
   * Download all data as a single combined PDF
   */
  async downloadCombinedPdf() {
    try {
      if (this.rowData.length === 0) {
        this.toastService.warning('⚠️ No data available to generate reports');
        return;
      }

      if (!this.currentSession || !this.currentSession._id) {
        this.toastService.warning('⚠️ Please save the session first before generating PDFs');
        return;
      }

      const totalReports = this.rowData.length;
      this.toastService.info(`📄 Creating combined PDF with ${totalReports} reports... Please wait`, 0);


      await this.saveCurrentSession();

      const filename = `પાણી ચકાસણી - Combined_${this.currentSession.date}_v${this.currentSession.version}.pdf`;
      await this.pdfService.downloadCombinedWaterSessionPDF(this.currentSession._id, filename);

      this.toastService.clear();
      this.toastService.success(`✅ Combined water report with ${totalReports} samples downloaded successfully!`, 5000);
    } catch (error) {

      this.toastService.clear();
      this.toastService.error('❌ Failed to generate combined PDF. Please try again.', 5000);
    }
  }
}
