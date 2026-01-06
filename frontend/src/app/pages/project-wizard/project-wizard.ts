import {Component, OnInit, OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Router, RouterModule, ActivatedRoute} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';
import {Subject, interval} from 'rxjs';
import {takeUntil, debounceTime} from 'rxjs/operators';
import {DashboardService} from '../../services/dashboard.service';
import {ToastService} from '../../services/toast.service';

interface Contact {
  contactId?: string;
  fullName: string;
  designation: string;
  phone: string;
  email?: string;
  role: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface BudgetCategory {
  category: string;
  percentage: number;
  amount: number;
}

interface Crop {
  name: string;
  variety?: string;
  season?: string;
  plantingDate?: Date;
  expectedHarvestDate?: Date;
  area?: number;
}

@Component({
  selector: 'app-project-wizard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './project-wizard.html',
  styleUrl: './project-wizard.css'
})
export class ProjectWizardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private autoSave$ = new Subject<void>();

  // Wizard state
  currentStep = 1;
  totalSteps = 6;
  isSubmitting = false;
  isSavingDraft = false;
  projectId?: string; // Project ID for draft association or editing
  isEditMode = false; // True when editing existing project
  isDraftMode = false; // True when resuming draft

  // Step 1: Basic Information
  projectName = '';
  projectCategory: 'FARM' | 'LANDSCAPING' | 'GARDENING' = 'FARM'; // Primary category field
  status = 'Upcoming';
  clientName = '';
  clientPhone = '';
  clientEmail = '';
  alternativeContact = '';

  // Category options for dropdown
  categoryOptions: Array<{
    value: 'FARM' | 'LANDSCAPING' | 'GARDENING';
    label: string;
    icon: string;
    description: string
  }> = [
    {value: 'FARM', label: 'Farm', icon: 'fa-tractor', description: 'Agricultural farming projects'},
    {value: 'LANDSCAPING', label: 'Landscaping', icon: 'fa-leaf', description: 'Landscape design and maintenance'},
    {value: 'GARDENING', label: 'Gardening', icon: 'fa-seedling', description: 'Garden design and care'}
  ];

  // Step 2: Location & Land Details
  address = '';
  city = '';
  state = '';
  postalCode = '';
  latitude?: number;
  longitude?: number;
  mapUrl = '';

  // Land details
  totalArea?: number;
  areaUnit = 'acres';
  cultivableArea?: number;
  soilType = '';
  waterSource: string[] = [];
  irrigationSystem = '';
  terrainType = '';

  // Step 3: Contacts
  contacts: Contact[] = [];
  newContact: Contact = this.getEmptyContact();

  // Step 4: Budget & Timeline
  totalBudget = 0;
  budgetCategories: BudgetCategory[] = [
    {category: 'Materials', percentage: 0, amount: 0},
    {category: 'Labor', percentage: 0, amount: 0},
    {category: 'Equipment', percentage: 0, amount: 0},
    {category: 'Consultancy', percentage: 0, amount: 0},
    {category: 'Testing', percentage: 0, amount: 0},
    {category: 'Transportation', percentage: 0, amount: 0},
    {category: 'Miscellaneous', percentage: 0, amount: 0}
  ];

  // Project Timeline
  numberOfYears: number = 1;
  visitFrequency: number = 0; // Visits per year

  // Step 5: Crops/Plants
  crops: Crop[] = [];
  newCrop: Crop = {name: ''};

  // Step 6: Team Assignment
  projectManagerId = '';
  fieldWorkerIds: string[] = [];
  consultantIds: string[] = [];

  // Available options
  statusOptions = ['Upcoming', 'Running', 'Completed', 'On Hold', 'Cancelled'];
  waterSourceOptions = ['Bore Well', 'Canal', 'River', 'Rainwater'];
  irrigationOptions = ['Drip', 'Sprinkler', 'Flood', 'Mixed'];
  terrainOptions = ['Flat', 'Sloped', 'Hilly', 'Mixed'];
  contactRoles = ['Owner', 'Manager', 'Architect', 'Supervisor', 'Worker', 'Consultant', 'Vendor', 'Other'];
  cropSeasons = ['Kharif', 'Rabi', 'Zaid', 'Perennial'];

  // Validation errors
  errors: { [key: string]: string } = {};

  constructor(
    private dashboardService: DashboardService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer
  ) {
  }

  ngOnInit(): void {
    this.setupAutoSave();
    this.checkModeAndLoadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========================
  // Auto-save functionality
  // ========================

  setupAutoSave(): void {
    // Auto-save every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.saveDraft(true); // Silent save
      });

    // Also save when user types (debounced)
    this.autoSave$
      .pipe(
        debounceTime(5000),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.saveDraft(true);
      });
  }

  triggerAutoSave(): void {
    this.autoSave$.next();
  }

  checkModeAndLoadData(): void {
    // Check URL path to determine mode
    const url = this.router.url;

    if (url.includes('/projects/edit/')) {
      // Edit mode: Load from route params
      this.isEditMode = true;
      this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
        const projectId = params['id'];
        if (projectId) {
          this.projectId = projectId;
          this.loadProjectData(projectId);
        }
      });
    } else {
      // Draft mode or new project: Check for draft data
      this.loadDraft();
    }
  }

  loadDraft(): void {
    // Check if draft data is passed via navigation state
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state || (window.history.state as any);

    if (state && state.draftData) {
      this.isDraftMode = true;
      // Extract project ID from draft data
      this.projectId = state.draftData.id || state.draftData._id;
      this.populateFormFromDraft(state.draftData);
      this.toastService.success('Draft loaded successfully');
    } else {
      // Fallback: Check if projectId is provided in query parameters
      this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
        const projectId = params['projectId'];
        if (projectId) {
          this.isDraftMode = true;
          this.projectId = projectId;
          this.loadDraftData(projectId);
        }
      });
    }
  }

  loadProjectData(projectId: string): void {
    this.dashboardService.getProjectDetails(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.populateFormFromDraft(response.data);
            this.toastService.success('Project loaded for editing');
          } else {
            this.toastService.error('Failed to load project');
            this.router.navigate(['/farm-dashboard']);
          }
        },
        error: (err) => {
          console.error('Error loading project:', err);
          this.toastService.error('Failed to load project');
          this.router.navigate(['/farm-dashboard']);
        }
      });
  }

  loadDraftData(projectId: string): void {

    this.dashboardService.getProjectDraft(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {

          if (response.success && response.data) {

            // Extract draft data from the response
            const draftData = response.data.draftData || response.data;
            // Set wizard step if available
            if (response.data.wizardStep) {
              this.currentStep = response.data.wizardStep;
            }
            this.populateFormFromDraft(draftData);
            this.toastService.success('Draft loaded successfully');
          } else {
            console.error('Failed to load draft - no data in response');
            this.toastService.error('Failed to load draft');
          }
        },
        error: (err) => {
          console.error('Error loading draft:', err);
          this.toastService.error('Failed to load draft');
        }
      });
  }

  populateFormFromDraft(draft: any): void {


    // Step 1: Basic Information
    // Handle both full draft format and simplified Project format
    if (draft.name) {
      this.projectName = draft.name;

    }
    // Handle category (primary) and legacy projectType/type fields
    if (draft.category) {
      this.projectCategory = draft.category;

    } else if (draft.projectType) {
      // Convert legacy projectType to category
      this.projectCategory = draft.projectType.toUpperCase() as 'FARM' | 'LANDSCAPING' | 'GARDENING';

    } else if (draft.type) {
      // Convert legacy type to category
      this.projectCategory = draft.type.toUpperCase() as 'FARM' | 'LANDSCAPING' | 'GARDENING';

    }
    if (draft.status) this.status = draft.status;

    // Handle client info - might be in clientName or client field
    if (draft.clientName) {
      this.clientName = draft.clientName;

    } else if (draft.client) {
      this.clientName = draft.client;

    }
    if (draft.clientPhone) this.clientPhone = draft.clientPhone;
    if (draft.clientEmail) this.clientEmail = draft.clientEmail;
    if (draft.alternativeContact) this.alternativeContact = draft.alternativeContact;

    // Step 2: Location & Land Details
    if (draft.location) {

      // Handle full location object (from draft)
      if (typeof draft.location === 'object') {
        if (draft.location.address) this.address = draft.location.address;
        if (draft.location.city) this.city = draft.location.city;
        if (draft.location.state) this.state = draft.location.state;
        if (draft.location.postalCode) this.postalCode = draft.location.postalCode;
        if (draft.location.mapUrl) this.mapUrl = draft.location.mapUrl;
        if (draft.location.coordinates?.coordinates) {
          this.longitude = draft.location.coordinates.coordinates[0];
          this.latitude = draft.location.coordinates.coordinates[1];

        }
      }
    }

    // Handle separate city/district fields (from Project interface)
    if (draft.city && !this.city) {
      this.city = draft.city;
    }
    if (draft.district) {
      // You might want to map this to state or another field
    }

    if (draft.landDetails) {
      if (draft.landDetails.totalArea) this.totalArea = draft.landDetails.totalArea;
      if (draft.landDetails.areaUnit) this.areaUnit = draft.landDetails.areaUnit;
      if (draft.landDetails.cultivableArea) this.cultivableArea = draft.landDetails.cultivableArea;
      if (draft.landDetails.soilType) this.soilType = draft.landDetails.soilType;
      if (draft.landDetails.waterSource) this.waterSource = draft.landDetails.waterSource;
      if (draft.landDetails.irrigationSystem) this.irrigationSystem = draft.landDetails.irrigationSystem;
      if (draft.landDetails.terrainType) this.terrainType = draft.landDetails.terrainType;
    }

    // Step 3: Contacts
    if (draft.contacts && Array.isArray(draft.contacts)) {
      this.contacts = draft.contacts;
    }

    // Step 4: Budget & Timeline
    if (draft.budget) {
      this.totalBudget = draft.budget;

    }
    if (draft.budgetCategories && Array.isArray(draft.budgetCategories)) {
      this.budgetCategories = draft.budgetCategories;

    }

    // Timeline fields
    if (draft.numberOfYears) {
      this.numberOfYears = draft.numberOfYears;

    }
    if (draft.visitFrequency) {
      this.visitFrequency = draft.visitFrequency;

    }

    // Step 5: Crops
    if (draft.crops && Array.isArray(draft.crops)) {
      this.crops = draft.crops.map((crop: any) => {
        // If crop is already an object with name, use it directly
        if (typeof crop === 'object' && crop.name) {
          return crop;
        }
        // If crop is a string, convert it to object format
        return {
          name: typeof crop === 'string' ? crop : crop.name || '',
          variety: crop.variety || '',
          season: crop.season || '',
          plantingDate: crop.plantingDate || undefined,
          expectedHarvestDate: crop.expectedHarvestDate || undefined,
          area: crop.area || undefined
        };
      });

    }

    // Step 6: Team Assignment
    if (draft.projectManager) this.projectManagerId = draft.projectManager;
    if (draft.fieldWorkers && Array.isArray(draft.fieldWorkers)) {
      this.fieldWorkerIds = draft.fieldWorkers;
    }
    if (draft.consultants && Array.isArray(draft.consultants)) {
      this.consultantIds = draft.consultants;
    }

    // Set the wizard step if available
    if (draft.wizardStep) {
      this.currentStep = draft.wizardStep;

    }
  }

  saveDraft(silent = false): void {
    if (this.isSubmitting || this.isSavingDraft) return;

    this.isSavingDraft = true;
    const draftData = this.collectFormData();

    // Call saveDraft API with projectId if available
    const request$ = this.dashboardService.saveProjectDraft(draftData, this.currentStep, this.projectId);

    request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            // Store the project ID for subsequent saves
            this.projectId = response.data.projectId || response.data.project?._id;
            if (!silent) {
              this.toastService.success('Draft saved successfully');
            }
          }
          this.isSavingDraft = false;
        },
        error: (err) => {
          console.error('Error saving draft:', err);
          if (!silent) {
            const errorMessage = err.error?.message || err.message || 'Failed to save draft';
            this.toastService.error(errorMessage);
          }
          this.isSavingDraft = false;
        }
      });
  }

  // ========================
  // Navigation
  // ========================

  nextStep(): void {
    if (!this.validateStep(this.currentStep)) {
      this.toastService.error('Please fix the errors before continuing');
      return;
    }

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.saveDraft(true);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } else {
      this.submitProject();
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({top: 0, behavior: 'smooth'});
    }
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep = step;
      window.scrollTo({top: 0, behavior: 'smooth'});
    }
  }

  cancel(): void {
    this.router.navigate(['/farm-dashboard']);
  }

  // ========================
  // Validation
  // ========================

  validateStep(step: number): boolean {
    this.errors = {};
    let isValid = true;

    switch (step) {
      case 1:
        if (!this.projectName.trim()) {
          this.errors['projectName'] = 'Project name is required';
          isValid = false;
        }
        if (!this.clientName.trim()) {
          this.errors['clientName'] = 'Client name is required';
          isValid = false;
        }
        if (!this.clientPhone.trim()) {
          this.errors['clientPhone'] = 'Client phone is required';
          isValid = false;
        } else if (!/^\d{10}$/.test(this.clientPhone.replace(/\D/g, ''))) {
          this.errors['clientPhone'] = 'Phone must be 10 digits';
          isValid = false;
        }
        if (this.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.clientEmail)) {
          this.errors['clientEmail'] = 'Invalid email format';
          isValid = false;
        }
        break;

      case 2:
        if (!this.address.trim()) {
          this.errors['address'] = 'Address is required';
          isValid = false;
        }
        if (!this.city.trim()) {
          this.errors['city'] = 'City is required';
          isValid = false;
        }

        // Validate coordinates if provided
        if (this.latitude !== undefined && this.latitude !== null) {
          if (this.latitude < -90 || this.latitude > 90) {
            this.errors['latitude'] = 'Latitude must be between -90 and 90';
            isValid = false;
          }
        }
        if (this.longitude !== undefined && this.longitude !== null) {
          if (this.longitude < -180 || this.longitude > 180) {
            this.errors['longitude'] = 'Longitude must be between -180 and 180';
            isValid = false;
          }
        }
        break;

      case 4:
        if (!this.totalBudget || this.totalBudget <= 0) {
          this.errors['totalBudget'] = 'Total budget is required';
          isValid = false;
        }
        const totalPercentage = this.budgetCategories.reduce((sum, cat) => sum + (cat.percentage || 0), 0);
        if (totalPercentage !== 100 && totalPercentage !== 0) {
          this.errors['budgetCategories'] = 'Budget categories must total 100%';
          isValid = false;
        }
        break;
    }

    return isValid;
  }

  // ========================
  // Step 3: Contact Management
  // ========================

  getEmptyContact(): Contact {
    return {
      fullName: '',
      designation: '',
      phone: '',
      email: '',
      role: 'Owner',
      isPrimary: false,
      isActive: true
    };
  }

  addContact(): void {
    if (!this.newContact.fullName.trim() || !this.newContact.phone.trim()) {
      this.toastService.error('Contact name and phone are required');
      return;
    }

    if (this.newContact.isPrimary) {
      this.contacts.forEach(c => c.isPrimary = false);
    }

    this.contacts.push({...this.newContact});
    this.newContact = this.getEmptyContact();
    this.toastService.success('Contact added');
    this.triggerAutoSave();
  }

  removeContact(index: number): void {
    this.contacts.splice(index, 1);
    this.triggerAutoSave();
  }

  setPrimaryContact(index: number): void {
    this.contacts.forEach((c, i) => c.isPrimary = i === index);
  }

  // ========================
  // Step 4: Budget Management
  // ========================

  onBudgetChange(): void {
    this.updateBudgetAmounts();
    this.triggerAutoSave();
  }

  onPercentageChange(index: number): void {
    this.budgetCategories[index].amount = (this.totalBudget * this.budgetCategories[index].percentage) / 100;
    this.triggerAutoSave();
  }

  updateBudgetAmounts(): void {
    this.budgetCategories.forEach(category => {
      category.amount = (this.totalBudget * category.percentage) / 100;
    });
  }

  equalDistribution(): void {
    const percentage = Math.floor(100 / this.budgetCategories.length);
    const remainder = 100 - (percentage * this.budgetCategories.length);

    this.budgetCategories.forEach((category, index) => {
      category.percentage = percentage + (index === 0 ? remainder : 0);
      category.amount = (this.totalBudget * category.percentage) / 100;
    });
  }

  get totalBudgetPercentage(): number {
    return this.budgetCategories.reduce((sum, cat) => sum + (cat.percentage || 0), 0);
  }

  // ========================
  // Step 5: Crop/Plant Management
  // ========================

  addCrop(): void {
    if (!this.newCrop.name.trim()) {
      this.toastService.error('Crop name is required');
      return;
    }

    this.crops.push({...this.newCrop});
    this.newCrop = {name: ''};
    this.toastService.success('Crop added');
    this.triggerAutoSave();
  }

  removeCrop(index: number): void {
    this.crops.splice(index, 1);
    this.triggerAutoSave();
  }

  // ========================
  // Step 6: Team Assignment
  // ========================

  toggleFieldWorker(workerId: string): void {
    const index = this.fieldWorkerIds.indexOf(workerId);
    if (index > -1) {
      this.fieldWorkerIds.splice(index, 1);
    } else {
      this.fieldWorkerIds.push(workerId);
    }
  }

  toggleConsultant(consultantId: string): void {
    const index = this.consultantIds.indexOf(consultantId);
    if (index > -1) {
      this.consultantIds.splice(index, 1);
    } else {
      this.consultantIds.push(consultantId);
    }
  }

  // ========================
  // Submit
  // ========================

  collectFormData(): any {
    const cultivablePercentage = this.totalArea && this.cultivableArea
      ? (this.cultivableArea / this.totalArea) * 100
      : 0;

    return {
      name: this.projectName,
      category: this.projectCategory, // Primary category field
      status: this.status,
      clientName: this.clientName,
      clientPhone: this.clientPhone,
      clientEmail: this.clientEmail,
      alternativeContact: this.alternativeContact,
      location: {
        address: this.address,
        city: this.city,
        state: this.state,
        postalCode: this.postalCode,
        coordinates: this.hasValidCoordinates() ? {
          type: 'Point',
          coordinates: [this.longitude, this.latitude]
        } : undefined,
        mapUrl: this.mapUrl
      },
      landDetails: {
        totalArea: this.totalArea,
        areaUnit: this.areaUnit,
        cultivableArea: this.cultivableArea,
        cultivablePercentage,
        soilType: this.soilType,
        waterSource: this.waterSource,
        irrigationSystem: this.irrigationSystem,
        terrainType: this.terrainType
      },
      budget: this.totalBudget,
      budgetCategories: this.budgetCategories.filter(c => c.percentage > 0),
      numberOfYears: this.numberOfYears,
      visitFrequency: this.visitFrequency,
      contacts: this.contacts,
      crops: this.crops,
      projectManager: this.projectManagerId || undefined,
      fieldWorkers: this.fieldWorkerIds,
      consultants: this.consultantIds
    };
  }

  submitProject(): void {
    if (!this.validateStep(this.currentStep)) {
      this.toastService.error('Please fix the errors before submitting');
      return;
    }

    this.isSubmitting = true;
    const projectData = this.collectFormData();

    let request$;
    let successMessage = '';

    if (this.isEditMode) {
      // Edit mode: Update existing project
      request$ = this.dashboardService.updateProject(this.projectId!, projectData);
      successMessage = 'Project updated successfully!';
    } else if (this.isDraftMode && this.projectId) {
      // Draft mode: Complete the draft
      request$ = this.dashboardService.completeDraft(this.projectId, projectData);
      successMessage = 'Project created successfully!';
    } else {
      // New project mode: Create new project
      request$ = this.dashboardService.createProject(projectData);
      successMessage = 'Project created successfully!';
    }

    request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.toastService.success(successMessage);
          this.router.navigate(['/project-details', response.data._id || response.data.id]);
        },
        error: (err) => {
          console.error('Error submitting project:', err);
          const errorMessage = err.error?.message || err.message || 'Failed to submit project';
          this.toastService.error(errorMessage);
          this.isSubmitting = false;
        }
      });
  }

  // ========================
  // Utility
  // ========================

  toggleWaterSource(source: string): void {
    const index = this.waterSource.indexOf(source);
    if (index > -1) {
      this.waterSource.splice(index, 1);
    } else {
      this.waterSource.push(source);
    }
  }

  get cultivablePercentage(): number {
    if (!this.totalArea || !this.cultivableArea) return 0;
    return Math.round((this.cultivableArea / this.totalArea) * 100);
  }

  get progressPercentage(): number {
    return Math.round((this.currentStep / this.totalSteps) * 100);
  }

  // ========================
  // Map Methods
  // ========================

  hasValidCoordinates(): boolean {
    return this.latitude !== undefined && this.latitude !== null &&
      this.longitude !== undefined && this.longitude !== null &&
      this.latitude >= -90 && this.latitude <= 90 &&
      this.longitude >= -180 && this.longitude <= 180;
  }

  hasInvalidCoordinates(): boolean {
    const hasLat = this.latitude !== undefined && this.latitude !== null;
    const hasLng = this.longitude !== undefined && this.longitude !== null;

    if (!hasLat && !hasLng) return false;

    const latInvalid = hasLat && (this.latitude! < -90 || this.latitude! > 90);
    const lngInvalid = hasLng && (this.longitude! < -180 || this.longitude! > 180);

    return latInvalid || lngInvalid;
  }

  getMapEmbedUrl(): SafeResourceUrl {
    if (!this.hasValidCoordinates()) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('');
    }

    // Using Google Maps Embed API (free, no API key needed)
    const url = `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d1000!2d${this.longitude}!3d${this.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sin`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  getDirectionsUrl(): string {
    if (!this.hasValidCoordinates()) return '#';
    return `https://www.google.com/maps/dir/?api=1&destination=${this.latitude},${this.longitude}`;
  }
}
