import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, interval } from 'rxjs';
import { ProjectService } from '../../services/project.service';
import { ToastService } from '../../services/toast.service';
import { BudgetSlidersComponent } from '../../components/budget-sliders/budget-sliders';
import { ContactManagerComponent } from '../../components/contact-manager/contact-manager';
import {
  Project, ProjectCategory, ProjectStatus, ProjectContact,
  BudgetCategory, Crop, CropSeason, ProjectLocation, LandDetails
} from '../../models/project.model';

interface WizardData {
  // Step 1
  name: string;
  category: ProjectCategory;
  status: ProjectStatus;
  description: string;
  priority: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  alternativeContact: string;
  // Step 2
  location: ProjectLocation;
  landDetails: LandDetails;
  // Step 3
  contacts: ProjectContact[];
  // Step 4
  budget: number;
  budgetCategories: BudgetCategory[];
  // Step 5
  crops: Crop[];
  // Step 6
  startDate: string;
  expectedCompletionDate: string;
  totalVisitsPlanned: number;
  numberOfYears: number;
  visitFrequencyConfig: { frequency?: string; customDays?: number; preferredDay?: string; preferredTime?: string };
  projectManager: string;
  fieldWorkers: string[];
  consultants: string[];
}

@Component({
  selector: 'app-project-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, BudgetSlidersComponent, ContactManagerComponent],
  templateUrl: './project-wizard.html',
  styleUrl: './project-wizard.css'
})
export class ProjectWizardComponent implements OnInit, OnDestroy {
  currentStep = 1;
  totalSteps = 6;
  projectId: string | null = null;
  isEditMode = false;
  saving = false;
  autoSaveEnabled = true;
  lastAutoSave: Date | null = null;

  stepLabels = ['Basic Info', 'Location & Land', 'Contacts', 'Budget', 'Crops', 'Team & Timeline'];

  data: WizardData = this.emptyData();

  errors: Record<string, string> = {};

  categories: { value: ProjectCategory; label: string; icon: string; desc: string }[] = [
    { value: 'FARM', label: 'Farm', icon: 'fas fa-tractor', desc: 'Agricultural land management' },
    { value: 'LANDSCAPING', label: 'Landscaping', icon: 'fas fa-tree', desc: 'Landscape design & maintenance' },
    { value: 'GARDENING', label: 'Gardening', icon: 'fas fa-seedling', desc: 'Garden planning & care' }
  ];

  statuses: ProjectStatus[] = ['Upcoming', 'Running', 'Completed', 'On Hold', 'Cancelled'];
  seasons: { value: CropSeason; label: string }[] = [
    { value: 'kharif', label: 'Kharif' },
    { value: 'rabi', label: 'Rabi' },
    { value: 'zaid', label: 'Zaid' },
    { value: 'perennial', label: 'Perennial' }
  ];

  waterSources = ['Borewell', 'River', 'Canal', 'Rainwater', 'Tank', 'Dam', 'Other'];
  soilTypes = ['Alluvial', 'Black/Regur', 'Red', 'Laterite', 'Desert/Arid', 'Saline', 'Peaty', 'Forest', 'Other'];
  terrainTypes = ['Flat', 'Hilly', 'Undulating', 'Coastal', 'River Plain', 'Other'];
  irrigationTypes = ['Drip', 'Sprinkler', 'Flood', 'Furrow', 'Rainfed', 'Other'];

  private destroy$ = new Subject<void>();

  constructor(
    private projectService: ProjectService,
    private toast: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const editId = this.route.snapshot.paramMap.get('id');
    if (editId) {
      this.isEditMode = true;
      this.projectId = editId;
      this.loadProject(editId);
    }

    // Auto-save every 30 seconds
    interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.autoSaveEnabled && this.data.name.trim()) {
        this.autoSave();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Navigation ───

  nextStep(): void {
    if (this.validateCurrentStep()) {
      this.currentStep = Math.min(this.currentStep + 1, this.totalSteps);
      this.autoSave();
    }
  }

  prevStep(): void {
    this.currentStep = Math.max(this.currentStep - 1, 1);
  }

  goToStep(step: number): void {
    if (step <= this.currentStep || this.validateCurrentStep()) {
      this.currentStep = step;
    }
  }

  // ─── Validation ───

  validateCurrentStep(): boolean {
    this.errors = {};
    if (this.currentStep === 1) {
      if (!this.data.name.trim()) this.errors['name'] = 'Project name is required';
      if (!this.data.category) this.errors['category'] = 'Select a category';
    }
    return Object.keys(this.errors).length === 0;
  }

  // ─── Crop Management ───

  addCrop(): void {
    this.data.crops.push({ name: '', variety: '', season: '', area: 0 });
  }

  removeCrop(index: number): void {
    this.data.crops.splice(index, 1);
  }

  // ─── Water Sources ───

  toggleWaterSource(source: string): void {
    if (!this.data.landDetails.waterSource) this.data.landDetails.waterSource = [];
    const idx = this.data.landDetails.waterSource.indexOf(source);
    if (idx >= 0) {
      this.data.landDetails.waterSource.splice(idx, 1);
    } else {
      this.data.landDetails.waterSource.push(source);
    }
  }

  isWaterSourceSelected(source: string): boolean {
    return this.data.landDetails.waterSource?.includes(source) || false;
  }

  // ─── Save & Submit ───

  async autoSave(): Promise<void> {
    if (this.saving) return;
    this.saving = true;

    const draftPayload = { draftData: this.data, wizardStep: this.currentStep };

    try {
      if (this.projectId) {
        await this.projectService.updateDraft(this.projectId, draftPayload).toPromise();
      } else {
        const result = await this.projectService.saveDraft(draftPayload).toPromise();
        if (result?._id) this.projectId = result._id;
      }
      this.lastAutoSave = new Date();
    } catch {
      // Silent fail for auto-save
    }
    this.saving = false;
  }

  async saveDraft(): Promise<void> {
    await this.autoSave();
    this.toast.success('Draft saved');
  }

  async submitProject(): Promise<void> {
    if (!this.validateCurrentStep()) return;
    if (!this.data.name.trim()) {
      this.toast.error('Project name is required');
      this.currentStep = 1;
      return;
    }

    this.saving = true;
    const projectData = this.buildProjectData();

    try {
      let result: Project | undefined;
      if (this.projectId) {
        result = await this.projectService.completeDraft(this.projectId, projectData).toPromise();
      } else {
        result = await this.projectService.createProject(projectData).toPromise();
      }
      this.toast.success('Project created successfully');
      this.router.navigate(['/farm-dashboard']);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      this.toast.error(message);
    }
    this.saving = false;
  }

  // ─── Load existing project for edit ───

  private loadProject(id: string): void {
    this.projectService.getProject(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (project) => {
        this.data = {
          name: project.name || '',
          category: project.category || 'FARM',
          status: project.status || 'Upcoming',
          description: project.description || '',
          priority: project.priority || 'medium',
          clientName: project.clientName || '',
          clientEmail: project.clientEmail || '',
          clientPhone: project.clientPhone || '',
          alternativeContact: project.alternativeContact || '',
          location: project.location || {},
          landDetails: project.landDetails || {},
          contacts: project.contacts || [],
          budget: project.budget || 0,
          budgetCategories: project.budgetCategories || [],
          crops: project.crops || [],
          startDate: project.startDate ? project.startDate.split('T')[0] : '',
          expectedCompletionDate: project.expectedCompletionDate ? project.expectedCompletionDate.split('T')[0] : '',
          totalVisitsPlanned: project.totalVisitsPlanned || 0,
          numberOfYears: project.numberOfYears || 0,
          visitFrequencyConfig: project.visitFrequencyConfig || { frequency: '' },
          projectManager: (project.projectManager as any)?._id || '',
          fieldWorkers: project.fieldWorkers?.map((f: any) => f._id || f) || [],
          consultants: project.consultants?.map((c: any) => c._id || c) || []
        };
      },
      error: () => {
        this.toast.error('Failed to load project');
        this.router.navigate(['/farm-dashboard']);
      }
    });
  }

  private buildProjectData(): Partial<Project> {
    return {
      name: this.data.name,
      category: this.data.category,
      status: this.data.status,
      description: this.data.description,
      priority: this.data.priority as any,
      clientName: this.data.clientName,
      clientEmail: this.data.clientEmail,
      clientPhone: this.data.clientPhone,
      alternativeContact: this.data.alternativeContact,
      location: this.data.location,
      landDetails: this.data.landDetails,
      contacts: this.data.contacts,
      budget: this.data.budget || 0,
      budgetCategories: this.data.budgetCategories,
      crops: this.data.crops.filter(c => c.name.trim()),
      startDate: this.data.startDate || undefined,
      expectedCompletionDate: this.data.expectedCompletionDate || undefined,
      totalVisitsPlanned: this.data.totalVisitsPlanned,
      numberOfYears: this.data.numberOfYears,
      visitFrequencyConfig: this.data.visitFrequencyConfig
    };
  }

  private emptyData(): WizardData {
    return {
      name: '', category: 'FARM', status: 'Upcoming', description: '', priority: 'medium',
      clientName: '', clientEmail: '', clientPhone: '', alternativeContact: '',
      location: {}, landDetails: { waterSource: [] },
      contacts: [], budget: 0, budgetCategories: [],
      crops: [],
      startDate: '', expectedCompletionDate: '', totalVisitsPlanned: 0, numberOfYears: 1,
      visitFrequencyConfig: { frequency: '' },
      projectManager: '', fieldWorkers: [], consultants: []
    };
  }

  // ─── Template helpers ───

  get Math() { return Math; }

  get autoSaveText(): string {
    if (!this.lastAutoSave) return '';
    return `Saved ${this.lastAutoSave.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
