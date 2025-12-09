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

@Component({
  selector: 'app-soil-testing',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  providers: [SoilTestingService],
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

  constructor(private soilTestingService: SoilTestingService) {
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
        alert('Failed to connect to backend server. Please ensure the backend is running on http://localhost:3000');
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

    // Get all row data from the grid to ensure we have latest data
    const allGridData: SoilTestingData[] = [];
    this.gridApi.forEachNode(node => {
      if (node.data) {
        allGridData.push(node.data);
      }
    });

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

    // Get all row data from the grid to ensure we have latest data
    const allGridData: SoilTestingData[] = [];
    this.gridApi.forEachNode(node => {
      if (node.data) {
        allGridData.push(node.data);
      }
    });

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

}
