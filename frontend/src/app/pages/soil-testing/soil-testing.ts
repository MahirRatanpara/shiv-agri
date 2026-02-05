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
import { SoilTestingService, Session, SoilTestingData } from '../../services/soil-testing.service';
import { PdfService } from '../../services/pdf.service';
import { ToastService } from '../../services/toast.service';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { SessionStateManager, SessionStatus } from '../../models/session-state.model';

@Component({
  selector: 'app-soil-testing',
  standalone: true,
  imports: [CommonModule, AgGridAngular, HasPermissionDirective],
  providers: [SoilTestingService, PdfService],
  templateUrl: './soil-testing.html',
  styleUrls: ['./soil-testing.css'],
})
export class SoilTestingComponent implements OnInit, OnDestroy {
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
  historyPage: number = 1;
  historyPageSize: number = 10;
  totalPages: number = 0;

  // Infinite Scroll State
  gridCurrentPage: number = 1;
  gridPageSize: number = 20;
  isLoadingMore: boolean = false;
  hasMoreData: boolean = true;

  // Completed sessions pagination
  completedPage: number = 1;
  completedPageSize: number = 10;
  completedTotalPages: number = 0;
  showCompletedSessions: boolean = false;

  // Auto-save timeout
  private saveTimeout: any = null;

  get activeSessions(): Session[] {
    return this.allSessions.filter(s => s.status !== 'completed');
  }

  get completedSessions(): Session[] {
    return this.allSessions.filter(s => s.status === 'completed');
  }

  get paginatedActiveSessions(): Session[] {
    const startIndex = (this.historyPage - 1) * this.historyPageSize;
    const endIndex = startIndex + this.historyPageSize;
    return this.activeSessions.slice(startIndex, endIndex);
  }

  get paginatedCompletedSessions(): Session[] {
    const startIndex = (this.completedPage - 1) * this.completedPageSize;
    const endIndex = startIndex + this.completedPageSize;
    return this.completedSessions.slice(startIndex, endIndex);
  }

  // Column Definitions
  colDefs: ColDef<SoilTestingData>[] = [
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
      field: 'cropType',
      headerName: 'Crop Type',
      editable: true,
      filter: true,
      minWidth: 150,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['', 'normal', 'small-fruit', 'large-fruit']
      },
      valueFormatter: (params: any) => {
        const value = params.value;
        if (!value || value === '') return '';
        if (value === 'normal') return 'Normal';
        if (value === 'small-fruit') return 'Small Fruit';
        if (value === 'large-fruit') return 'Large Fruit';
        return value;
      },
      cellStyle: (params: any) => {
        if (params.value && params.value !== '') {
          return { backgroundColor: '#e8f5e9', fontWeight: '600' };
        }
        return null;
      }
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
    private pdfService: PdfService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

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

    this.soilTestingService.getTodaySessionCount().subscribe({
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
    this.soilTestingService.getAllSessions().subscribe({
      next: (sessions) => {
        this.allSessions = sessions;
        // Calculate pagination for active sessions
        const activeCount = sessions.filter(s => s.status !== 'completed').length;
        this.totalPages = Math.ceil(activeCount / this.historyPageSize);
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

  nextPage() {
    if (this.historyPage < this.totalPages) {
      this.historyPage++;
    }
  }

  prevPage() {
    if (this.historyPage > 1) {
      this.historyPage--;
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.historyPage = page;
    }
  }

  loadTodaySessionCount() {
    this.soilTestingService.getTodaySessionCount().subscribe({
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


    this.soilTestingService.createSession(newSession).subscribe({
      next: (session) => {
        this.currentSession = session;
        this.sessionActive = true;
        this.rowData = [];
        this.todaySessionCount = version;

        // Navigate to the session URL
        if (session._id) {
          this.sessionIdFromUrl = session._id;
          this.router.navigate(['/lab-testing/soil-testing/session', session._id], {
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
   * Initialize state manager when session loads
   */
  private initializeStateManager() {
    if (this.currentSession?.status) {
      this.stateManager = new SessionStateManager(this.currentSession.status);
    } else {
      this.stateManager = new SessionStateManager('started');
    }
  }

  /**
   * Check if can perform an action based on current state
   */
  canPerformAction(action: 'addRow' | 'uploadExcel' | 'deleteSelected' | 'downloadPDFs' | 'editData'): boolean {
    return this.stateManager.canPerformAction(action);
  }

  /**
   * Get current state label for display
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
   * Get progress percentage for progress bar
   */
  getStateProgress(): number {
    return this.stateManager.getStateProgress();
  }

  /**
   * Check if current state is active (for styling)
   */
  isStateActive(status: SessionStatus): boolean {
    return this.currentSession?.status === status;
  }

  /**
   * Check if state is completed (for styling)
   */
  isStateCompleted(status: SessionStatus): boolean {
    const states: SessionStatus[] = ['started', 'details', 'ready', 'completed'];
    const currentIndex = states.indexOf(this.currentSession?.status || 'started');
    const targetIndex = states.indexOf(status);
    return targetIndex < currentIndex;
  }

  /**
   * Transition to next state
   */
  async nextState() {
    if (!this.currentSession?._id) {
      this.toastService.warning('⚠️ No active session');
      return;
    }

    const nextStatus = this.stateManager.getNextState();
    if (!nextStatus) {
      this.toastService.warning('⚠️ Already at final state');
      return;
    }

    try {
      // Save current data first
      await this.saveCurrentSession();

      // Transition to next state
      this.soilTestingService.updateSessionStatus(this.currentSession._id, nextStatus).subscribe({
        next: (session) => {
          this.currentSession = session;
          this.stateManager.transitionTo(nextStatus);
          this.updateGridEditability(); // Lock/unlock grid based on new state
          this.toastService.success(`✅ Moved to ${this.stateManager.getCurrentState().label} state`, 3000);
        },
        error: (err) => {
          this.toastService.error('❌ Failed to update state');
        }
      });
    } catch (error) {
      this.toastService.error('❌ Failed to save session data');
    }
  }

  /**
   * Transition to previous state
   */
  previousState() {
    if (!this.currentSession?._id) {
      this.toastService.warning('⚠️ No active session');
      return;
    }

    const prevStatus = this.stateManager.getPreviousState();
    if (!prevStatus) {
      this.toastService.warning('⚠️ Already at first state');
      return;
    }

    this.soilTestingService.updateSessionStatus(this.currentSession._id, prevStatus).subscribe({
      next: (session) => {
        this.currentSession = session;
        this.stateManager.transitionTo(prevStatus);
        this.updateGridEditability(); // Lock/unlock grid based on new state
        this.toastService.success(`✅ Moved to ${this.stateManager.getCurrentState().label} state`, 3000);
      },
      error: (err) => {
        this.toastService.error('❌ Failed to update state');
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
      this.toastService.warning('⚠️ No active session');
      return;
    }

    if (!this.stateManager.canTransitionTo(targetStatus)) {
      this.toastService.warning('⚠️ Cannot transition to this state', 3000);
      return;
    }

    try {
      // Save current data first
      await this.saveCurrentSession();

      // Then transition to new state
      this.soilTestingService.updateSessionStatus(this.currentSession._id, targetStatus).subscribe({
        next: (session) => {
          this.currentSession = session;
          this.stateManager.transitionTo(targetStatus);
          this.updateGridEditability(); // Lock/unlock grid based on new state
          this.toastService.success(`✅ Moved to ${this.getCurrentStateLabel()} state`, 3000);
        },
        error: (error) => {
          this.toastService.error('❌ Failed to update session state', 4000);
        }
      });
    } catch (error) {
      this.toastService.error('❌ Failed to save session data');
    }
  }

  /**
   * Close session and save as draft
   */
  async closeSession() {
    if (!this.currentSession?._id) {
      return;
    }

    try {
      // Save current data as draft
      await this.saveCurrentSession();

      // Close session UI
      this.sessionActive = false;
      const sessionDate = this.currentSession.date;
      const sessionVersion = this.currentSession.version;
      this.currentSession = null;
      this.rowData = [];
      this.hasSelectedRows = false;
      this.sessionIdFromUrl = null;

      // Navigate back to dashboard
      this.router.navigate(['/lab-testing/soil-testing']);

      // Reload sessions
      this.loadSessions();
      this.toastService.success(`Session ${sessionDate} v${sessionVersion} saved and closed`, 4000);
    } catch (error) {
      this.toastService.error('Failed to save session');
    }
  }

  /**
   * Navigate to dashboard
   */
  goToDashboard() {
    this.sessionIdFromUrl = null;
    this.sessionLoadError = null;
    this.router.navigate(['/lab-testing/soil-testing']);
  }

  /**
   * Load a session from URL parameter
   */
  loadSessionFromUrl(sessionId: string) {
    this.isLoadingSession = true;
    this.sessionLoadError = null;

    this.soilTestingService.getSession(sessionId).pipe(
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
    this.router.navigate(['/lab-testing/soil-testing']);
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
    this.router.navigate(['/lab-testing/soil-testing']);
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
    const sessionUrl = `${baseUrl}/lab-testing/soil-testing/session/${targetSession._id}`;

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

  /**
   * Resume a session and initialize state manager
   */
  resumeSession(session: Session) {
    this.currentSession = session;
    this.sessionActive = true;
    this.rowData = []; // Start empty, load paginated
    this.hasSelectedRows = false;

    // Reset infinite scroll state
    this.gridCurrentPage = 1;
    this.hasMoreData = true;
    this.isLoadingMore = false;

    // Initialize state manager with current status
    this.initializeStateManager();

    // Update URL to include session ID (only if not already there)
    if (session._id && this.sessionIdFromUrl !== session._id) {
      this.sessionIdFromUrl = session._id;
      this.router.navigate(['/lab-testing/soil-testing/session', session._id], {
        replaceUrl: true
      });
    }

    // Load first page of data
    if (session._id) {
      this.loadMoreSamples();
    }

    // Update grid editability after grid is ready
    setTimeout(() => {
      this.updateGridEditability();
    }, 100);

    this.toastService.success(`Resumed session: ${session.date} v${session.version} - ${this.getCurrentStateLabel()}`, 4000);
  }

  /**
   * Load next page of samples
   */
  loadMoreSamples() {
    if (this.isLoadingMore || !this.hasMoreData || !this.currentSession?._id) return;

    this.isLoadingMore = true;

    this.soilTestingService.getSamplesForSession(
      this.currentSession._id,
      this.gridCurrentPage,
      this.gridPageSize
    ).subscribe({
      next: (response) => {
        const newSamples = response.samples;

        if (newSamples.length < this.gridPageSize) {
          this.hasMoreData = false;
        }

        if (this.gridCurrentPage === 1) {
          this.rowData = newSamples;
          if (this.gridApi) {
            this.gridApi.setGridOption('rowData', this.rowData);
          }
        } else {
          // Append new samples
          this.rowData = [...this.rowData, ...newSamples];
          if (this.gridApi) {
            this.gridApi.applyTransaction({ add: newSamples });
          }
        }

        this.gridCurrentPage++;
        this.isLoadingMore = false;
      },
      error: (err) => {
        console.error('Error loading samples', err);
        this.isLoadingMore = false;
        this.toastService.error('Failed to load more samples');
      }
    });
  }

  /**
   * Handle grid body scroll for infinite loading
   */
  onBodyScroll(event: any) {
    if (event.direction === 'vertical') {
      const api = event.api;
      const lastDisplayedRow = api.getLastDisplayedRow();
      const totalRows = api.getDisplayedRowCount();

      // If user scrolled near the bottom (last 5 rows), load more
      if (lastDisplayedRow >= totalRows - 5) {
        this.loadMoreSamples();
      }
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

    // Trigger auto-save after 2 seconds of inactivity
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.autoSaveSession();
    }, 2000);
  }

  onSelectionChanged() {
    const selectedRows = this.gridApi.getSelectedRows();
    this.hasSelectedRows = selectedRows.length > 0;
  }

  addNewRow() {
    const newRow: SoilTestingData = {
      sampleNumber: '',
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
      if (!confirm(`Delete ${selectedRows.length} rows?`)) return;

      const idsToDelete = selectedRows.map(r => r._id).filter(id => !!id) as string[];

      // If we have IDs, delete from backend
      if (idsToDelete.length > 0 && this.currentSession?._id) {
        this.soilTestingService.deleteSamplesBulk(this.currentSession._id, idsToDelete).subscribe({
          next: () => {
            this.toastService.success(`Deleted ${idsToDelete.length} rows`);
          },
          error: () => this.toastService.error('Failed to delete rows')
        });
      }

      // Always remove from grid
      this.gridApi.applyTransaction({ remove: selectedRows });

      // Also remove from rowData array to keep sync
      selectedRows.forEach(row => {
        const index = this.rowData.indexOf(row);
        if (index > -1) {
          this.rowData.splice(index, 1);
        }
      });

      this.hasSelectedRows = false;
    }
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
          sampleNumber: this.gridApi.getValue('sampleNumber', node) || '',
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
          cropType: this.gridApi.getValue('cropType', node) || '',
          finalDeduction: this.gridApi.getValue('finalDeduction', node) || '',
        };

        // Include _id if it exists (for updates)
        if (node.data._id) {
          completeData._id = node.data._id;
        }

        // Include fertilizerSampleId if it exists (for linking)
        if (node.data.fertilizerSampleId) {
          completeData.fertilizerSampleId = node.data.fertilizerSampleId;
        }

        // Debug logging for troubleshooting

        allGridData.push(completeData);
      }
    });


    return allGridData;
  }

  /**
   * Auto-save session data without refreshing the grid
   */
  private async autoSaveSession(): Promise<void> {
    if (!this.currentSession || !this.currentSession._id) {
      return;
    }

    const allGridData: SoilTestingData[] = this.extractGridDataWithCalculatedValues();

    if (allGridData.length === 0) {
      return;
    }

    this.soilTestingService.bulkUpdateSamples(this.currentSession._id, allGridData).subscribe({
      next: (response: any) => {
        // Update IDs and fertilizer links without refreshing the entire grid
        if (response.samples && Array.isArray(response.samples)) {
          this.gridApi.forEachNode((node, index) => {
            if (node.data && response.samples[index]) {
              const updatedSample = response.samples[index];
              // Update _id if it was newly created
              if (!node.data._id && updatedSample._id) {
                node.data._id = updatedSample._id;
              }
              // Update fertilizerSampleId if it was created/updated
              if (updatedSample.fertilizerSampleId !== undefined) {
                node.data.fertilizerSampleId = updatedSample.fertilizerSampleId;
              }
            }
          });
        }
        console.log('✅ Auto-saved session data');
        // Show a subtle toast notification
        this.toastService.success('Changes saved', 1000);
      },
      error: (error) => {
        console.error('❌ Auto-save failed:', error);
        this.toastService.error('Auto-save failed. Please try again.');
      }
    });
  }

  /**
   * Save current session data silently (or with refresh)
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession || !this.currentSession._id) {
      return Promise.reject('No active session to save');
    }

    const allGridData: SoilTestingData[] = this.extractGridDataWithCalculatedValues();

    if (allGridData.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.soilTestingService.bulkUpdateSamples(this.currentSession!._id!, allGridData).subscribe({
        next: (response) => {
          // After save, we should refresh the data to ensure we have IDs for new rows
          // and correct calculations from backend if any

          // Note: If we just saved, we might want to keep the user's scroll position?
          // For now, refreshing the list is safest to sync IDs.

          this.rowData = [];
          this.gridCurrentPage = 1;
          this.hasMoreData = true;
          this.isLoadingMore = false;

          // Reload
          this.loadMoreSamples();

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
  async downloadSinglePdf(data: SoilTestingData) {
    try {
      // Show downloading toast
      this.toastService.info('📄 Preparing your soil report... Please wait', 0);


      // STEP 1: Save session to database and wait for completion
      await this.saveCurrentSession();

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

      // Clear all toasts and show success message
      this.toastService.clear();
      this.toastService.success(`✅ Soil report for ${farmerName} downloaded successfully!`, 4000);
    } catch (error) {

      this.toastService.clear();
      this.toastService.error('❌ Failed to generate PDF report. Please try again.', 5000);
    }
  }

  /**
   * Download all PDFs (individual files) using streaming with progress widget
   */
  async downloadAllPdfs() {
    if (this.rowData.length === 0) {
      this.toastService.warning('⚠️ No data available to generate reports');
      return;
    }

    try {
      // STEP 1: Save session to database and wait for completion
      await this.saveCurrentSession();

      // STEP 2: Verify we have a session ID
      if (!this.currentSession?._id) {
        throw new Error('Session ID not found. Please save the session first.');
      }

      // STEP 3: Generate bulk PDFs using streaming endpoint
      // Progress is now handled by the download progress widget
      await this.pdfService.streamBulkSessionPDFs(this.currentSession._id);

    } catch (error) {
      console.error('Error downloading PDFs:', error);
      // Error is already handled by the progress widget
    }
  }

  /**
   * Download all data as a single combined PDF
   */
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

      this.toastService.show('Failed to preview PDF report', 'error');
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
   * Upload Excel file and update/append data to grid (Server Side)
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
      this.soilTestingService.uploadExcel(this.currentSession._id, file).subscribe({
        next: (response) => {
          this.toastService.success(
            `✅ Excel imported successfully! Updated: ${response.updated}, Added: ${response.added}`,
            5000
          );

          // Refresh data (clear and reload)
          this.rowData = [];
          this.gridCurrentPage = 1;
          this.hasMoreData = true;
          this.isLoadingMore = false;
          this.loadMoreSamples();
        },
        error: (error) => {
          console.error('Error uploading Excel:', error);
          this.toastService.error(error.error?.error || 'Failed to upload Excel file');
        }
      });
    } catch (error) {
      this.toastService.error('Failed to initiate upload');
    }
  }

  /**
   * Trigger file input click
   */
  triggerExcelUpload() {
    const fileInput = document.getElementById('excelFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

}
