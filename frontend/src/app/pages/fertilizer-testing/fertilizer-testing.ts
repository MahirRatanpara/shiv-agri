import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, CellValueChangedEvent } from 'ag-grid-community';
import { FertilizerTestingService, FertilizerSession, FertilizerSampleData } from '../../services/fertilizer-testing.service';
import { SoilTestingService } from '../../services/soil-testing.service';
import { PdfService } from '../../services/pdf.service';
import { ToastService } from '../../services/toast.service';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { FertilizerSessionStateManager, FertilizerSessionStatus } from '../../models/fertilizer-session-state.model';

type CropType = 'normal' | 'small-fruit' | 'large-fruit';

@Component({
  selector: 'app-fertilizer-testing',
  standalone: true,
  imports: [CommonModule, AgGridAngular, HasPermissionDirective],
  providers: [FertilizerTestingService, SoilTestingService, PdfService],
  templateUrl: './fertilizer-testing.html',
  styleUrls: ['./fertilizer-testing.css'],
})
export class FertilizerTestingComponent implements OnInit, OnDestroy {
  gridApi!: GridApi;
  private destroy$ = new Subject<void>();

  // URL-based session tracking
  sessionIdFromUrl: string | null = null;
  isLoadingSession: boolean = false;
  sessionLoadError: string | null = null;

  // Session Management
  currentSession: FertilizerSession | null = null;
  sessionActive: boolean = false;
  allSessions: FertilizerSession[] = [];
  currentDate = new Date();
  todaySessionCount: number = 0;
  isBackendConnected: boolean = false;
  isLoading: boolean = true;
  hasSelectedRows: boolean = false;

  // State Management
  stateManager: FertilizerSessionStateManager = new FertilizerSessionStateManager('started');
  readonly allStates = FertilizerSessionStateManager.getAllStates();

  // Current crop type tab
  activeCropType: CropType = 'normal';

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

  get activeSessions(): FertilizerSession[] {
    return this.allSessions.filter(s => s.status !== 'completed');
  }

  get completedSessions(): FertilizerSession[] {
    return this.allSessions.filter(s => s.status === 'completed');
  }

  get paginatedActiveSessions(): FertilizerSession[] {
    const startIndex = (this.historyPage - 1) * this.historyPageSize;
    const endIndex = startIndex + this.historyPageSize;
    return this.activeSessions.slice(startIndex, endIndex);
  }

  get paginatedCompletedSessions(): FertilizerSession[] {
    const startIndex = (this.completedPage - 1) * this.completedPageSize;
    const endIndex = startIndex + this.completedPageSize;
    return this.completedSessions.slice(startIndex, endIndex);
  }

  // Column Definitions for different crop types
  normalColDefs: ColDef<FertilizerSampleData>[] = [];
  smallFruitColDefs: ColDef<FertilizerSampleData>[] = [];
  largeFruitColDefs: ColDef<FertilizerSampleData>[] = [];

  get colDefs(): ColDef<FertilizerSampleData>[] {
    switch (this.activeCropType) {
      case 'normal': return this.normalColDefs;
      case 'small-fruit': return this.smallFruitColDefs;
      case 'large-fruit': return this.largeFruitColDefs;
      default: return this.normalColDefs;
    }
  }

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
  rowData: FertilizerSampleData[] = [];

  // Soil Data Popup
  showSoilDataPopup: boolean = false;
  currentSoilData: any = null;
  private soilDataCache: Map<string, any> = new Map();
  private currentEditingRowId: string | null = null;

  constructor(
    private fertilizerTestingService: FertilizerTestingService,
    private soilTestingService: SoilTestingService,
    private pdfService: PdfService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.initializeColumnDefinitions();
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

    // Add document click listener to close soil popup when clicking outside grid
    document.addEventListener('click', this.handleDocumentClick.bind(this));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Remove document click listener
    document.removeEventListener('click', this.handleDocumentClick.bind(this));
  }

  /**
   * Handle clicks outside the grid to close soil popup
   */
  private handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Only close if clicking completely outside the main content area
    if (!target.closest('.main-content') &&
        !target.closest('.soil-data-bar') &&
        !target.closest('.ag-grid-angular')) {
      this.closeSoilPopup();
    }
  }

  initializeColumnDefinitions() {
    // Common columns for all types
    const commonCols: ColDef<FertilizerSampleData>[] = [
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
        field: 'farmerName',
        headerName: "Farmer Name",
        editable: true,
        filter: true,
        minWidth: 180,
        pinned: 'left',
      },
      {
        field: 'cropName',
        headerName: 'Crop Name',
        editable: true,
        filter: true,
        minWidth: 140,
      }
    ];

    // Normal crop columns - organized by sections
    this.normalColDefs = [
      ...commonCols,
      { field: 'nValue', headerName: 'N Value', editable: true, cellDataType: 'number', minWidth: 85 },
      { field: 'pValue', headerName: 'P Value', editable: true, cellDataType: 'number', minWidth: 85 },
      { field: 'kValue', headerName: 'K Value', editable: true, cellDataType: 'number', minWidth: 85 },
      // Organic fertilizers
      { field: 'organicManure', headerName: 'Organic Manure', editable: true, cellDataType: 'number', minWidth: 130, headerClass: 'header-section-organic' },
      { field: 'castorCake', headerName: 'Castor Cake', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-organic' },
      { field: 'gypsum', headerName: 'Gypsum', editable: true, cellDataType: 'number', minWidth: 100, headerClass: 'header-section-organic' },
      { field: 'sardarAmin', headerName: 'Sardar Amin', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-organic' },
      { field: 'micronutrient', headerName: 'Micronutrient', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-organic' },
      { field: 'borocol', headerName: 'Borocol', editable: true, cellDataType: 'number', minWidth: 100, headerClass: 'header-section-organic' },
      { field: 'ferrous', headerName: 'Ferrous', editable: true, cellDataType: 'number', minWidth: 100, headerClass: 'header-section-organic' },
      // Chemical fertilizers
      { field: 'dap', headerName: 'DAP', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-chemical' },
      { field: 'npk12', headerName: 'NPK 12:32:16', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-chemical' },
      { field: 'asp', headerName: 'ASP', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-chemical' },
      { field: 'narmadaPhos', headerName: 'Narmada Phos', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-chemical' },
      { field: 'ssp', headerName: 'SSP', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-chemical' },
      { field: 'ammoniumSulphate', headerName: 'Ammonium Sulphate', editable: true, cellDataType: 'number', minWidth: 150, headerClass: 'header-section-chemical' },
      { field: 'mop', headerName: 'MOP', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-chemical' },
      { field: 'ureaBase', headerName: 'Urea (Base)', editable: true, cellDataType: 'number', minWidth: 105, headerClass: 'header-section-chemical' },
      // Dose fertilizers
      { field: 'day15', headerName: 'Day 15', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-dose' },
      { field: 'day25Npk', headerName: 'Day 25 NPK', editable: true, cellDataType: 'number', minWidth: 105, headerClass: 'header-section-dose' },
      { field: 'day25Tricho', headerName: 'Day 25 Tricho', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-dose' },
      { field: 'day30', headerName: 'Day 30', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-dose' },
      { field: 'day45', headerName: 'Day 45', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-dose' },
      { field: 'day60', headerName: 'Day 60', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-dose' },
      { field: 'day75', headerName: 'Day 75', editable: true, cellDataType: 'number', minWidth: 85, headerClass: 'header-section-dose' },
      { field: 'day90Urea', headerName: 'Day 90 Urea', editable: true, cellDataType: 'number', minWidth: 105, headerClass: 'header-section-dose' },
      { field: 'day90Mag', headerName: 'Day 90 Mag', editable: true, cellDataType: 'number', minWidth: 105, headerClass: 'header-section-dose' },
      { field: 'day105', headerName: 'Day 105', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-dose' },
      { field: 'day115', headerName: 'Day 115', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-dose' },
      { field: 'day130', headerName: 'Day 130', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-dose' },
      { field: 'day145', headerName: 'Day 145', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-dose' },
      { field: 'day160', headerName: 'Day 160', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-dose' },
      // Actions column
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

    // Small fruit tree columns - organized by months
    this.smallFruitColDefs = [
      ...commonCols,
      // June section
      { field: 'june_dap', headerName: 'June DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_npk', headerName: 'June NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_asp', headerName: 'June ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_narmada', headerName: 'June Narmada', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-june' },
      { field: 'june_ssp', headerName: 'June SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_as', headerName: 'June AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_mop', headerName: 'June MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_urea', headerName: 'June Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      // Month 2 section
      { field: 'month2_dap', headerName: 'M2 DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      { field: 'month2_npk', headerName: 'M2 NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      { field: 'month2_asp', headerName: 'M2 ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      { field: 'month2_narmada', headerName: 'M2 Narmada', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-month2' },
      { field: 'month2_ssp', headerName: 'M2 SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      { field: 'month2_as', headerName: 'M2 AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      { field: 'month2_mop', headerName: 'M2 MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      { field: 'month2_urea', headerName: 'M2 Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month2' },
      // October section
      { field: 'october_dap', headerName: 'Oct DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      { field: 'october_npk', headerName: 'Oct NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      { field: 'october_asp', headerName: 'Oct ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      { field: 'october_narmada', headerName: 'Oct Narmada', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-october' },
      { field: 'october_ssp', headerName: 'Oct SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      { field: 'october_as', headerName: 'Oct AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      { field: 'october_mop', headerName: 'Oct MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      { field: 'october_urea', headerName: 'Oct Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-october' },
      // February section
      { field: 'february_dap', headerName: 'Feb DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_npk', headerName: 'Feb NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_asp', headerName: 'Feb ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_narmada', headerName: 'Feb Narmada', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-february' },
      { field: 'february_ssp', headerName: 'Feb SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_as', headerName: 'Feb AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_mop', headerName: 'Feb MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_urea', headerName: 'Feb Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      // Spray section
      { field: 'spray_npk1919', headerName: 'Spray NPK 19:19:19', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_npk0052', headerName: 'Spray NPK 00:52:34', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_npk1261', headerName: 'Spray NPK 12:61:00', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_npk1300', headerName: 'Spray NPK 13:00:45', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_micromix', headerName: 'Spray Micromix', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-spray' },
      // Actions column
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

    // Large fruit tree columns
    this.largeFruitColDefs = [
      ...commonCols,
      // June section
      { field: 'june_dap', headerName: 'June DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_npk', headerName: 'June NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_asp', headerName: 'June ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_narmada', headerName: 'June Narmada', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-june' },
      { field: 'june_ssp', headerName: 'June SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_as', headerName: 'June AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_mop', headerName: 'June MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      { field: 'june_urea', headerName: 'June Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-june' },
      // August section
      { field: 'august_dap', headerName: 'Aug DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      { field: 'august_npk', headerName: 'Aug NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      { field: 'august_asp', headerName: 'Aug ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      { field: 'august_narmada', headerName: 'Aug Narmada', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-august' },
      { field: 'august_ssp', headerName: 'Aug SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      { field: 'august_as', headerName: 'Aug AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      { field: 'august_mop', headerName: 'Aug MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      { field: 'august_urea', headerName: 'Aug Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-august' },
      // February section
      { field: 'february_dap', headerName: 'Feb DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_npk', headerName: 'Feb NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_asp', headerName: 'Feb ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_narmada', headerName: 'Feb Narmada', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-february' },
      { field: 'february_ssp', headerName: 'Feb SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_as', headerName: 'Feb AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_mop', headerName: 'Feb MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      { field: 'february_urea', headerName: 'Feb Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-february' },
      // Month 4 section
      { field: 'month4_dap', headerName: 'M4 DAP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      { field: 'month4_npk', headerName: 'M4 NPK', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      { field: 'month4_asp', headerName: 'M4 ASP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      { field: 'month4_narmada', headerName: 'M4 Narmada', editable: true, cellDataType: 'number', minWidth: 115, headerClass: 'header-section-month4' },
      { field: 'month4_ssp', headerName: 'M4 SSP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      { field: 'month4_as', headerName: 'M4 AS', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      { field: 'month4_mop', headerName: 'M4 MOP', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      { field: 'month4_urea', headerName: 'M4 Urea', editable: true, cellDataType: 'number', minWidth: 95, headerClass: 'header-section-month4' },
      // Spray section
      { field: 'spray_npk1919', headerName: 'Spray NPK 19:19:19', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_npk0052', headerName: 'Spray NPK 00:52:34', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_npk1261', headerName: 'Spray NPK 12:61:00', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_npk1300', headerName: 'Spray NPK 13:00:45', editable: true, cellDataType: 'number', minWidth: 140, headerClass: 'header-section-spray' },
      { field: 'spray_micromix', headerName: 'Spray Micromix', editable: true, cellDataType: 'number', minWidth: 120, headerClass: 'header-section-spray' },
      // Actions column
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
  }

  checkBackendConnection() {
    this.isLoading = true;

    this.fertilizerTestingService.getTodaySessionCount().subscribe({
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
    this.fertilizerTestingService.getAllSessions().subscribe({
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
    const stateConfig = this.stateManager.getStateConfig(status as FertilizerSessionStatus);
    return stateConfig.label;
  }

  getStatusColor(status: string | undefined): string {
    if (!status) return '#999';
    const stateConfig = this.stateManager.getStateConfig(status as FertilizerSessionStatus);
    return stateConfig.color;
  }

  getStatusIcon(status: string | undefined): string {
    if (!status) return 'fa-question';
    const stateConfig = this.stateManager.getStateConfig(status as FertilizerSessionStatus);
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
      startTime: new Date().toISOString()
    };

    this.fertilizerTestingService.createSession(newSession).subscribe({
      next: (session) => {
        this.currentSession = session;
        this.sessionActive = true;
        this.rowData = [];
        this.todaySessionCount = version;

        // Initialize state manager
        this.initializeStateManager();

        // Navigate to the session URL
        if (session._id) {
          this.sessionIdFromUrl = session._id;
          this.router.navigate(['/lab-testing/fertilizer-testing/session', session._id], {
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
      this.stateManager = new FertilizerSessionStateManager(this.currentSession.status);
    } else {
      this.stateManager = new FertilizerSessionStateManager('started');
    }
  }

  /**
   * Check if can perform an action based on current state
   */
  canPerformAction(action: 'downloadPDFs' | 'editData'): boolean {
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
  isStateActive(status: FertilizerSessionStatus): boolean {
    return this.currentSession?.status === status;
  }

  /**
   * Check if state is completed (for styling)
   */
  isStateCompleted(status: FertilizerSessionStatus): boolean {
    const states: FertilizerSessionStatus[] = ['started', 'generate-reports', 'completed'];
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
      this.fertilizerTestingService.updateSessionStatus(this.currentSession._id, nextStatus).subscribe({
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

    this.fertilizerTestingService.updateSessionStatus(this.currentSession._id, prevStatus).subscribe({
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
  getAvailableTransitions(): { status: FertilizerSessionStatus; config: any }[] {
    const currentState = this.stateManager.getCurrentState();
    return this.allStates.filter(state =>
      currentState.canTransitionTo.includes(state.status)
    );
  }

  /**
   * Transition to a specific state
   */
  async transitionToState(targetStatus: FertilizerSessionStatus) {
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
      this.fertilizerTestingService.updateSessionStatus(this.currentSession._id, targetStatus).subscribe({
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
      this.router.navigate(['/lab-testing/fertilizer-testing']);

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
    this.router.navigate(['/lab-testing/fertilizer-testing']);
  }

  /**
   * Load a session from URL parameter
   */
  loadSessionFromUrl(sessionId: string) {
    this.isLoadingSession = true;
    this.sessionLoadError = null;

    this.fertilizerTestingService.getSession(sessionId).pipe(
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
    this.router.navigate(['/lab-testing/fertilizer-testing']);
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
    this.router.navigate(['/lab-testing/fertilizer-testing']);
  }

  /**
   * Copy the session link to clipboard
   */
  copySessionLink(session?: FertilizerSession) {
    const targetSession = session || this.currentSession;
    if (!targetSession?._id) {
      this.toastService.warning('No session to share');
      return;
    }

    const baseUrl = window.location.origin;
    const sessionUrl = `${baseUrl}/lab-testing/fertilizer-testing/session/${targetSession._id}`;

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
  resumeSession(session: FertilizerSession) {
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
      this.router.navigate(['/lab-testing/fertilizer-testing/session', session._id], {
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
   * Switch crop type tab
   */
  switchCropType(type: CropType) {
    this.activeCropType = type;
    // Reload grid with new column definitions
    if (this.gridApi) {
      this.gridApi.setGridOption('columnDefs', this.colDefs);
      // Filter data to show only samples of this type
      this.loadSamplesForCropType(type);
    }
  }

  /**
   * Load samples for specific crop type
   */
  loadSamplesForCropType(type: CropType) {
    if (!this.currentSession?._id) return;

    // Reset pagination
    this.gridCurrentPage = 1;
    this.hasMoreData = true;
    this.isLoadingMore = false;
    this.rowData = [];

    // Load samples
    this.loadMoreSamples();
  }

  /**
   * Load next page of samples
   */
  loadMoreSamples() {
    if (this.isLoadingMore || !this.hasMoreData || !this.currentSession?._id) return;

    this.isLoadingMore = true;

    this.fertilizerTestingService.getSamplesForSession(
      this.currentSession._id,
      this.gridCurrentPage,
      this.gridPageSize
    ).subscribe({
      next: (response) => {
        // Filter by crop type
        const newSamples = response.samples.filter(s => s.type === this.activeCropType);

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
      // Skip columns that should never be editable (checkboxes)
      if (col.checkboxSelection) {
        return col;
      }

      // For all user input columns, set editable based on current state
      return { ...col, editable: canEdit };
    });

    // Update the appropriate column definition array
    switch (this.activeCropType) {
      case 'normal':
        this.normalColDefs = updatedColDefs;
        break;
      case 'small-fruit':
        this.smallFruitColDefs = updatedColDefs;
        break;
      case 'large-fruit':
        this.largeFruitColDefs = updatedColDefs;
        break;
    }

    this.gridApi.setGridOption('columnDefs', updatedColDefs);
  }

  onCellValueChanged(event: CellValueChangedEvent) {
    // Sync changes back to rowData array
    const rowIndex = event.node.rowIndex;
    if (rowIndex !== null && rowIndex !== undefined) {
      this.rowData[rowIndex] = event.data;
    }

    // Auto-resize the column that was edited
    event.api.autoSizeColumns([event.column.getColId()], false);
  }

  onSelectionChanged() {
    const selectedRows = this.gridApi.getSelectedRows();
    this.hasSelectedRows = selectedRows.length > 0;
  }

  // NOTE: Fertilizer entries are now auto-created from Soil Testing only
  // Manual add/delete is disabled to maintain data integrity

  // addNewRow() - DISABLED: Entries are linked from Soil Testing
  // deleteSelectedRows() - DISABLED: Entries are linked from Soil Testing

  /**
   * Extract all row data from grid
   */
  private extractGridData(): FertilizerSampleData[] {
    const allGridData: FertilizerSampleData[] = [];
    this.gridApi.forEachNode(node => {
      if (node.data) {
        allGridData.push(node.data);
      }
    });
    return allGridData;
  }

  /**
   * Save current session data silently (or with refresh)
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession || !this.currentSession._id) {
      return Promise.reject('No active session to save');
    }

    const allGridData: FertilizerSampleData[] = this.extractGridData();

    if (allGridData.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.fertilizerTestingService.bulkUpdateSamples(this.currentSession!._id!, allGridData).subscribe({
        next: (response) => {
          // After save, refresh the data to ensure we have IDs for new rows
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

  // ===== EXCEL UPLOAD METHODS =====

  // ===== PDF GENERATION METHODS =====

  /**
   * Download PDF for a single sample
   */
  async downloadSinglePdf(data: FertilizerSampleData) {
    try {
      // Show downloading toast
      this.toastService.info('📄 Preparing your fertilizer report... Please wait', 0);

      // STEP 1: Save session to database and wait for completion
      await this.saveCurrentSession();

      // STEP 2: Find the saved sample with its database ID
      const savedRow = this.rowData.find(row =>
        row.farmerName === data.farmerName && row.sampleNumber === data.sampleNumber
      ) || data;

      if (!savedRow._id) {
        throw new Error('Sample ID not found. Please save the data first.');
      }

      // STEP 3: Generate PDF from backend using sample ID
      const farmerName = savedRow.farmerName || 'Unknown';
      const filename = `ખાતર ચકાસણી - ${farmerName}.pdf`;

      await this.pdfService.downloadFertilizerSamplePDF(savedRow._id, filename);

      // Clear all toasts and show success message
      this.toastService.clear();
      this.toastService.success(`✅ Fertilizer report for ${farmerName} downloaded successfully!`, 4000);
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
      await this.pdfService.streamBulkFertilizerPDFs(this.currentSession._id);

    } catch (error) {
      console.error('Error downloading PDFs:', error);
      // Error is already handled by the progress widget
    }
  }

  // ===== SOIL DATA POPUP METHODS =====

  /**
   * Show soil data popup for linked sample
   */
  async showSoilDataForSample(sampleData: FertilizerSampleData) {
    // Only show if sample is linked to soil sample
    if (!sampleData.soilSampleId) {
      // If no soil data, hide the popup
      this.showSoilDataPopup = false;
      this.currentSoilData = null;
      return;
    }

    // Check cache first
    if (this.soilDataCache.has(sampleData.soilSampleId)) {
      const cachedData = this.soilDataCache.get(sampleData.soilSampleId);
      // Always update the data, even if popup is already visible
      this.currentSoilData = cachedData;
      this.showSoilDataPopup = true;
      return;
    }

    // Fetch soil data
    try {
      this.soilTestingService.getSoilDataForSample(sampleData.soilSampleId).subscribe({
        next: (soilData) => {
          this.currentSoilData = soilData;
          this.soilDataCache.set(sampleData.soilSampleId!, soilData);
          this.showSoilDataPopup = true;
        },
        error: (error) => {
          console.error('Error fetching soil data:', error);
          this.toastService.error('Failed to load soil data');
        }
      });
    } catch (error) {
      console.error('Error showing soil data:', error);
    }
  }

  /**
   * Close soil data popup
   */
  closeSoilPopup() {
    this.showSoilDataPopup = false;
    this.currentSoilData = null;
    this.currentEditingRowId = null;
  }

  /**
   * Handle cell click to show/update soil data
   */
  onCellClicked(event: any) {
    // Show/update soil data when clicking on any cell in a row with soil data
    if (event.data && event.data.soilSampleId) {
      const rowId = event.data._id || event.node.id;

      // Update to this row's soil data
      this.currentEditingRowId = rowId;
      this.showSoilDataForSample(event.data);
    }
  }

  /**
   * Handle row click - show/update soil data for the row
   */
  onRowClicked(event: any) {
    // Update soil data when clicking anywhere on a row with soil data
    if (event.data && event.data.soilSampleId) {
      const rowId = event.data._id || event.node.id;
      this.currentEditingRowId = rowId;
      this.showSoilDataForSample(event.data);
    }
  }

  /**
   * Handle cell editing started - ensure soil data is showing
   */
  onCellEditingStarted(event: any) {
    if (event.data && event.data.soilSampleId) {
      const rowId = event.data._id || event.node.id;
      this.currentEditingRowId = rowId;
      this.showSoilDataForSample(event.data);
    }
  }

  /**
   * Handle cell editing stopped - keep popup visible
   */
  onCellEditingStopped(event: any) {
    // Don't close - let user keep seeing the data
  }
}
