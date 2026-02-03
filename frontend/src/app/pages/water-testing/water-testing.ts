import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
import { SessionStateManager, SessionStatus } from '../../models/session-state.model';

@Component({
  selector: 'app-water-testing',
  standalone: true,
  imports: [CommonModule, AgGridAngular, HasPermissionDirective],
  providers: [WaterTestingService, PdfService],
  templateUrl: './water-testing.html',
  styleUrls: ['./water-testing.css'],
})
export class WaterTestingComponent implements OnInit, OnDestroy {
  private gridApi!: GridApi;
  private destroy$ = new Subject<void>();

  // URL-based session tracking
  sessionIdFromUrl: string | null = null;
  isLoadingSession: boolean = false;
  sessionLoadError: string | null = null;

  // Session Management
  currentSession: Session | null = null;
  sessionActive: boolean = false;
  allSessions: Session[] = [];
  currentDate = new Date();
  todaySessionCount: number = 0;
  isBackendConnected: boolean = false;
  isLoading: boolean = true;
  hasSelectedRows: boolean = false;

  // State Management
  stateManager: SessionStateManager = new SessionStateManager('started');
  readonly allStates = SessionStateManager.getAllStates();

  // Pagination for session history
  currentPage: number = 1;
  pageSize: number = 10;
  totalPages: number = 0;

  // Completed sessions pagination
  completedPage: number = 1;
  completedPageSize: number = 10;
  completedTotalPages: number = 0;
  showCompletedSessions: boolean = false;

  get activeSessions(): Session[] {
    return this.allSessions.filter(s => s.status !== 'completed');
  }

  get completedSessions(): Session[] {
    return this.allSessions.filter(s => s.status === 'completed');
  }

  get paginatedActiveSessions(): Session[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.activeSessions.slice(startIndex, endIndex);
  }

  get paginatedCompletedSessions(): Session[] {
    const startIndex = (this.completedPage - 1) * this.completedPageSize;
    const endIndex = startIndex + this.completedPageSize;
    return this.completedSessions.slice(startIndex, endIndex);
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
      field: 'sampleNumber',
      headerName: 'Sample No.',
      editable: true,
      filter: true,
      minWidth: 120,
      pinned: 'left',
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
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check backend connectivity first
    this.checkBackendConnection();

    // Subscribe to route params for session ID
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const sessionId = params['sessionId'];
      if (sessionId && sessionId !== this.sessionIdFromUrl) {
        this.sessionIdFromUrl = sessionId;
        // Only load session from URL after backend is connected and sessions are loaded
        if (this.isBackendConnected && this.allSessions.length > 0) {
          this.loadSessionFromUrl(sessionId);
        }
      } else if (!sessionId && this.sessionActive) {
        // If navigating back to dashboard from an active session
        this.sessionActive = false;
        this.currentSession = null;
        this.rowData = [];
        this.sessionIdFromUrl = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
        // Calculate pagination for active sessions
        const activeCount = sessions.filter(s => s.status !== 'completed').length;
        this.totalPages = Math.ceil(activeCount / this.pageSize);
        // Calculate pagination for completed sessions
        const completedCount = sessions.filter(s => s.status === 'completed').length;
        this.completedTotalPages = Math.ceil(completedCount / this.completedPageSize);

        // If we have a session ID from URL, load it now
        if (this.sessionIdFromUrl && !this.sessionActive) {
          this.loadSessionFromUrl(this.sessionIdFromUrl);
        }
      },
      error: (error) => {
        this.isBackendConnected = false;
      }
    });
  }

  toggleCompletedSessions() {
    this.showCompletedSessions = !this.showCompletedSessions;
  }

  nextCompletedPage() {
    if (this.completedPage < this.completedTotalPages) {
      this.completedPage++;
    }
  }

  prevCompletedPage() {
    if (this.completedPage > 1) {
      this.completedPage--;
    }
  }

  getStatusLabel(status: string | undefined): string {
    if (!status) return 'Unknown';
    const stateConfig = this.stateManager.getStateConfig(status as SessionStatus);
    return stateConfig.label;
  }

  getStatusColor(status: string | undefined): string {
    if (!status) return '#999';
    const stateConfig = this.stateManager.getStateConfig(status as SessionStatus);
    return stateConfig.color;
  }

  getStatusIcon(status: string | undefined): string {
    if (!status) return 'fa-question';
    const stateConfig = this.stateManager.getStateConfig(status as SessionStatus);
    return stateConfig.icon;
  }

  /**
   * Navigate to dashboard
   */
  goToDashboard() {
    this.sessionIdFromUrl = null;
    this.sessionLoadError = null;
    this.router.navigate(['/lab-testing/water-testing']);
  }

  /**
   * Load a session from URL parameter
   */
  loadSessionFromUrl(sessionId: string) {
    this.isLoadingSession = true;
    this.sessionLoadError = null;

    this.waterTestingService.getSession(sessionId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (session) => {
        this.isLoadingSession = false;
        if (session) {
          this.resumeSession(session);
        } else {
          this.handleSessionNotFound(sessionId);
        }
      },
      error: (error) => {
        this.isLoadingSession = false;
        this.handleSessionLoadError(sessionId, error);
      }
    });
  }

  /**
   * Handle session not found error
   */
  private handleSessionNotFound(sessionId: string) {
    this.sessionLoadError = `Session not found: ${sessionId}`;
    this.toastService.error('Session not found. It may have been deleted.', 5000);
    // Navigate back to dashboard
    this.sessionIdFromUrl = null;
    this.router.navigate(['/lab-testing/water-testing']);
  }

  /**
   * Handle session load error
   */
  private handleSessionLoadError(sessionId: string, error: any) {
    console.error('Error loading session:', error);
    this.sessionLoadError = `Failed to load session: ${error.message || 'Unknown error'}`;
    this.toastService.error('Failed to load session. Please try again.', 5000);
    // Navigate back to dashboard
    this.sessionIdFromUrl = null;
    this.router.navigate(['/lab-testing/water-testing']);
  }

  /**
   * Copy the session link to clipboard
   */
  copySessionLink(session?: Session) {
    const targetSession = session || this.currentSession;
    if (!targetSession?._id) {
      this.toastService.warning('No session to share');
      return;
    }

    const baseUrl = window.location.origin;
    const sessionUrl = `${baseUrl}/lab-testing/water-testing/session/${targetSession._id}`;

    navigator.clipboard.writeText(sessionUrl).then(() => {
      this.toastService.success('Session link copied to clipboard!', 3000);
    }).catch((err) => {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      this.fallbackCopyToClipboard(sessionUrl);
    });
  }

  /**
   * Fallback method for copying to clipboard (older browsers)
   */
  private fallbackCopyToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      this.toastService.success('Session link copied to clipboard!', 3000);
    } catch (err) {
      this.toastService.error('Failed to copy link. Please copy manually.');
    }
    document.body.removeChild(textArea);
  }

  resumeSession(session: Session) {
    this.currentSession = session;
    this.sessionActive = true;
    this.rowData = session.data || [];
    this.initializeStateManager();

    // Update URL to include session ID (only if not already there)
    if (session._id && this.sessionIdFromUrl !== session._id) {
      this.sessionIdFromUrl = session._id;
      this.router.navigate(['/lab-testing/water-testing/session', session._id], {
        replaceUrl: true
      });
    }

    // Update grid editability after grid is ready
    setTimeout(() => {
      this.updateGridEditability();
    }, 100);

    this.toastService.success(`Resumed session: ${session.date} v${session.version} - ${this.getCurrentStateLabel()}`, 4000);
  }

  /**
   * Initialize state manager with current session status
   */
  private initializeStateManager() {
    if (this.currentSession && this.currentSession.status) {
      this.stateManager = new SessionStateManager(this.currentSession.status);
    } else {
      this.stateManager = new SessionStateManager('started');
    }
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
        this.initializeStateManager();

        // Navigate to the session URL
        if (session._id) {
          this.sessionIdFromUrl = session._id;
          this.router.navigate(['/lab-testing/water-testing/session', session._id], {
            replaceUrl: true
          });
        }
      },
      error: (error) => {
        this.toastService.show('Failed to create session: ' + (error.error?.error || error.message || 'Unknown error'), 'error');
        this.isBackendConnected = false;
      }
    });
  }

  // ===== STATE MANAGEMENT METHODS =====

  /**
   * Close session (save draft and exit)
   */
  closeSession() {
    if (!this.currentSession || !this.currentSession._id) {
      this.toastService.show('No active session to close', 'warning');
      return;
    }

    // Get all row data from the grid with calculated values
    const allGridData: WaterTestingData[] = this.extractGridDataWithCalculatedValues();

    const updates = {
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
        this.sessionIdFromUrl = null;

        // Navigate back to dashboard
        this.router.navigate(['/lab-testing/water-testing']);

        // Reload sessions from backend to ensure sync
        this.loadSessions();
        this.loadTodaySessionCount();
        this.toastService.success('Session saved as draft', 3000);
      },
      error: (error) => {
        this.toastService.show('Failed to save session: ' + (error.error?.error || error.message || 'Unknown error'), 'error');
      }
    });
  }

  /**
   * Check if an action is allowed in the current state
   */
  canPerformAction(action: 'addRow' | 'uploadExcel' | 'deleteSelected' | 'downloadPDFs'): boolean {
    return this.stateManager.canPerformAction(action);
  }

  /**
   * Get current state label
   */
  getCurrentStateLabel(): string {
    return this.stateManager.getCurrentState().label;
  }

  /**
   * Get current state icon
   */
  getCurrentStateIcon(): string {
    return this.stateManager.getCurrentState().icon;
  }

  /**
   * Get current state color
   */
  getCurrentStateColor(): string {
    return this.stateManager.getCurrentState().color;
  }

  /**
   * Get current state description
   */
  getCurrentStateDescription(): string {
    return this.stateManager.getCurrentState().description;
  }

  /**
   * Check if can move to next state
   */
  canMoveToNextState(): boolean {
    return this.stateManager.getNextState() !== null;
  }

  /**
   * Check if can move to previous state
   */
  canMoveToPreviousState(): boolean {
    return this.stateManager.getPreviousState() !== null;
  }

  /**
   * Get state progress percentage
   */
  getStateProgress(): number {
    return this.stateManager.getStateProgress();
  }

  /**
   * Check if a specific state is active
   */
  isStateActive(status: SessionStatus): boolean {
    return this.currentSession?.status === status;
  }

  /**
   * Check if a specific state is completed
   */
  isStateCompleted(status: SessionStatus): boolean {
    const states: SessionStatus[] = ['started', 'details', 'ready', 'completed'];
    const currentIndex = states.indexOf(this.currentSession?.status || 'started');
    const targetIndex = states.indexOf(status);
    return targetIndex < currentIndex;
  }

  /**
   * Move to next state
   */
  nextState() {
    const nextState = this.stateManager.getNextState();
    if (!nextState || !this.currentSession || !this.currentSession._id) {
      return;
    }

    this.waterTestingService.updateSessionStatus(this.currentSession._id, nextState).subscribe({
      next: (session) => {
        this.currentSession = session;
        this.stateManager.transitionTo(nextState);
        this.updateGridEditability(); // Lock/unlock grid based on new state
        this.toastService.success(`Moved to ${this.getCurrentStateLabel()} state`, 3000);
      },
      error: (error) => {
        this.toastService.error('Failed to update session state: ' + (error.error?.error || error.message), 4000);
      }
    });
  }

  /**
   * Move to previous state
   */
  previousState() {
    const previousState = this.stateManager.getPreviousState();
    if (!previousState || !this.currentSession || !this.currentSession._id) {
      return;
    }

    this.waterTestingService.updateSessionStatus(this.currentSession._id, previousState).subscribe({
      next: (session) => {
        this.currentSession = session;
        this.stateManager.transitionTo(previousState);
        this.updateGridEditability(); // Lock/unlock grid based on new state
        this.toastService.success(`Moved to ${this.getCurrentStateLabel()} state`, 3000);
      },
      error: (error) => {
        this.toastService.error('Failed to update session state: ' + (error.error?.error || error.message), 4000);
      }
    });
  }

  /**
   * Get available state transitions from current state
   */
  getAvailableTransitions(): { status: SessionStatus; config: any }[] {
    const currentState = this.stateManager.getCurrentState();
    return this.allStates.filter(state =>
      currentState.canTransitionTo.includes(state.status)
    );
  }

  /**
   * Transition to a specific state
   */
  async transitionToState(targetStatus: SessionStatus) {
    if (!this.currentSession || !this.currentSession._id) {
      this.toastService.warning('No active session');
      return;
    }

    if (!this.stateManager.canTransitionTo(targetStatus)) {
      this.toastService.warning('Cannot transition to this state', 3000);
      return;
    }

    try {
      // Save current data first
      await this.saveCurrentSession();

      // Then transition to new state
      this.waterTestingService.updateSessionStatus(this.currentSession._id, targetStatus).subscribe({
        next: (session) => {
          this.currentSession = session;
          this.stateManager.transitionTo(targetStatus);
          this.updateGridEditability(); // Lock/unlock grid based on new state
          this.toastService.success(`Moved to ${this.getCurrentStateLabel()} state`, 3000);
        },
        error: (error) => {
          this.toastService.error('Failed to update session state', 4000);
        }
      });
    } catch (error) {
      this.toastService.error('Failed to save session data');
    }
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

    // Update grid editability based on current state
    this.updateGridEditability();
  }

  /**
   * Update grid editability based on current state
   */
  updateGridEditability() {
    if (!this.gridApi) return;

    const canEdit = this.stateManager.canPerformAction('editData');

    // Update all column definitions to enable/disable editing
    const updatedColDefs = this.colDefs.map(col => {
      // Skip columns that should never be editable (calculated fields, actions, checkboxes)
      if (col.valueGetter || col.cellRenderer || col.checkboxSelection) {
        return col;
      }

      // For all user input columns, set editable based on current state
      return { ...col, editable: canEdit };
    });

    this.colDefs = updatedColDefs;
    this.gridApi.setGridOption('columnDefs', this.colDefs);
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

  onSelectionChanged() {
    const selectedRows = this.gridApi.getSelectedRows();
    this.hasSelectedRows = selectedRows.length > 0;
  }

  addNewRow() {
    const newRow: WaterTestingData = {
      sampleNumber: '',
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

  /**
   * Extract all row data from grid including calculated values
   */
  private extractGridDataWithCalculatedValues(): WaterTestingData[] {
    const allGridData: WaterTestingData[] = [];
    this.gridApi.forEachNode(node => {
      if (node.data) {
        // Get all values from the grid
        const completeData: WaterTestingData = {
          sampleNumber: this.gridApi.getValue('sampleNumber', node) || '',
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

  // ===== EXCEL UPLOAD METHODS =====

  /**
   * Handle Excel file selection
   */
  onExcelFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.uploadExcelFile(file);

    // Reset input so the same file can be selected again
    input.value = '';
  }

  /**
   * Upload Excel file and update/append data to grid
   */
  private async uploadExcelFile(file: File) {
    if (!this.currentSession || !this.currentSession._id) {
      this.toastService.error('Please start a session before uploading Excel file', 4000);
      return;
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (!validTypes.includes(file.type)) {
      this.toastService.error('Please upload a valid Excel file (.xlsx or .xls)', 4000);
      return;
    }

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.toastService.error('File size must be less than 5MB', 4000);
      return;
    }

    this.toastService.info('📤 Processing Excel file...', 3000);

    try {
      // Read and parse Excel file using xlsx library
      const XLSX = await import('xlsx');
      const reader = new FileReader();

      reader.onload = async (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

          if (jsonData.length < 2) {
            this.toastService.error('Excel file is empty or has no data rows', 4000);
            return;
          }

          // Parse Excel data (skip header row)
          const excelRows = [];
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row[0]) continue; // Skip if no sample number

            excelRows.push({
              sampleNumber: row[0]?.toString().trim() || '',
              farmersName: row[1]?.toString().trim() || '',
              mobileNo: row[2]?.toString().trim() || '',
              location: row[3]?.toString().trim() || '',
              farmsName: row[4]?.toString().trim() || '',
              taluka: row[5]?.toString().trim() || '',
              boreWellType: row[6]?.toString().trim() || ''
            });
          }

          if (excelRows.length === 0) {
            this.toastService.error('No valid data found in Excel file', 4000);
            return;
          }

          // Create a map of existing samples by sample number
          const existingSamplesMap = new Map<string, WaterTestingData>();
          this.rowData.forEach(sample => {
            if (sample.sampleNumber) {
              existingSamplesMap.set(sample.sampleNumber.trim(), sample);
            }
          });

          let updatedCount = 0;
          let addedCount = 0;

          // Process each Excel row
          excelRows.forEach(excelRow => {
            const existingSample = existingSamplesMap.get(excelRow.sampleNumber);

            if (existingSample) {
              // Only update farmer details, keep test values unchanged
              existingSample.farmersName = excelRow.farmersName;
              existingSample.mobileNo = excelRow.mobileNo;
              existingSample.location = excelRow.location;
              existingSample.farmsName = excelRow.farmsName;
              existingSample.taluka = excelRow.taluka;
              existingSample.boreWellType = excelRow.boreWellType;

              updatedCount++;
            } else {
              // Add new sample
              const newSample: WaterTestingData = {
                sampleNumber: excelRow.sampleNumber,
                farmersName: excelRow.farmersName,
                mobileNo: excelRow.mobileNo,
                location: excelRow.location,
                farmsName: excelRow.farmsName,
                taluka: excelRow.taluka,
                boreWellType: excelRow.boreWellType,
                ph: null,
                ec: null,
                caMgBlank: null,
                caMgStart: null,
                caMgEnd: null,
                classification: '',
                co3Hco3: null,
                finalDeduction: ''
              };
              this.rowData.push(newSample);
              addedCount++;
            }
          });

          // Sort samples by sample number in ascending order
          this.rowData.sort((a, b) => {
            const sampleA = a.sampleNumber?.toLowerCase() || '';
            const sampleB = b.sampleNumber?.toLowerCase() || '';
            return sampleA.localeCompare(sampleB, undefined, { numeric: true, sensitivity: 'base' });
          });

          // Refresh the grid
          this.gridApi.setGridOption('rowData', this.rowData);

          // Save to backend
          await this.saveCurrentSession();

          this.toastService.success(
            `✅ Excel imported successfully! Updated: ${updatedCount}, Added: ${addedCount}`,
            5000
          );

        } catch (error) {
          console.error('Error parsing Excel file:', error);
          this.toastService.error('Failed to parse Excel file. Please check the format.', 5000);
        }
      };

      reader.onerror = () => {
        this.toastService.error('Failed to read Excel file', 4000);
      };

      reader.readAsArrayBuffer(file);

    } catch (error) {
      console.error('Error uploading Excel:', error);
      this.toastService.error('Failed to upload Excel file. Please try again.', 4000);
    }
  }

  /**
   * Trigger file input click
   */
  triggerExcelUpload() {
    const fileInput = document.getElementById('waterExcelFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

}
