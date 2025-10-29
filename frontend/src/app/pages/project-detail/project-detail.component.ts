import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LandscapingService } from '../../services/landscaping.service';
import {
  Project,
  ProjectStatus,
  Contact,
  FileUpload,
  FileType,
  LandInfo
} from '../../models/landscaping.model';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './project-detail.component.html',
  styleUrls: ['./project-detail.component.css']
})
export class ProjectDetailComponent implements OnInit {
  projectForm!: FormGroup;
  projectId: string | null = null;
  isEditMode = false;
  isNewProject = false;
  loading = false;
  saving = false;
  error: string | null = null;

  project: Project | null = null;
  projectStatuses = Object.values(ProjectStatus);
  contactRoles = ['OWNER', 'ARCHITECT', 'WORKER', 'SUPERVISOR', 'OTHER'];
  landUnits = ['sqft', 'acres', 'sqm'];
  fileTypes = Object.values(FileType);

  // Active tab
  activeTab = 'basic';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private landscapingService: LandscapingService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.projectId = params['id'];
      console.log('ngOnInit - params received, projectId:', this.projectId);

      if (this.projectId === 'new') {
        this.isNewProject = true;
        this.isEditMode = true;
        console.log('ngOnInit - Setting NEW PROJECT mode');
      } else if (this.projectId) {
        this.isNewProject = false;
        this.isEditMode = true;
        console.log('ngOnInit - Setting EXISTING PROJECT mode');
        this.loadProject();
      } else {
        console.warn('ngOnInit - No projectId found in params!');
      }

      console.log('ngOnInit - Final state: isNewProject:', this.isNewProject, 'isEditMode:', this.isEditMode);
    });
  }

  initializeForm(): void {
    this.projectForm = this.fb.group({
      projectName: ['', Validators.required],
      farmName: [''],
      status: [ProjectStatus.UPCOMING, Validators.required],
      description: [''],
      startDate: [''],
      endDate: [''],
      estimatedCost: [0],
      actualCost: [0],
      notes: [''],
      location: this.fb.group({
        address: ['', Validators.required],
        city: ['', Validators.required],
        state: ['', Validators.required],
        pincode: ['', Validators.required],
        coordinates: this.fb.group({
          latitude: [0],
          longitude: [0]
        }),
        mapUrl: ['']
      }),
      landInfo: this.fb.group({
        size: [0, [Validators.required, Validators.min(0)]],
        unit: ['sqft', Validators.required],
        soilType: [''],
        irrigationType: [''],
        waterSource: [''],
        coordinates: ['']
      }),
      contacts: this.fb.array([])
    });

    // Add one contact by default for new projects
    if (this.isNewProject) {
      this.addContact();
    }
  }

  loadProject(): void {
    if (!this.projectId) return;

    this.loading = true;
    this.error = null;

    this.landscapingService.getProjectById(this.projectId).subscribe({
      next: (project) => {
        this.project = project;
        this.populateForm(project);
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load project details. Please try again.';
        console.error('Error loading project:', err);
        this.loading = false;
      }
    });
  }

  populateForm(project: Project): void {
    this.projectForm.patchValue({
      projectName: project.projectName,
      farmName: project.farmName,
      status: project.status,
      description: project.description,
      startDate: project.startDate ? this.formatDateForInput(new Date(project.startDate)) : '',
      endDate: project.endDate ? this.formatDateForInput(new Date(project.endDate)) : '',
      estimatedCost: project.estimatedCost || 0,
      actualCost: project.actualCost || 0,
      notes: project.notes,
      location: {
        address: project.location.address,
        city: project.location.city,
        state: project.location.state,
        pincode: project.location.pincode,
        coordinates: {
          latitude: project.location.coordinates.latitude,
          longitude: project.location.coordinates.longitude
        },
        mapUrl: project.location.mapUrl
      },
      landInfo: {
        size: project.landInfo.size,
        unit: project.landInfo.unit,
        soilType: project.landInfo.soilType,
        irrigationType: project.landInfo.irrigationType,
        waterSource: project.landInfo.waterSource,
        coordinates: project.landInfo.coordinates
      }
    });

    // Populate contacts
    if (project.contacts && project.contacts.length > 0) {
      project.contacts.forEach(contact => {
        this.addContact(contact);
      });
    }
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  get contacts(): FormArray {
    return this.projectForm.get('contacts') as FormArray;
  }

  addContact(contact?: Contact): void {
    const contactGroup = this.fb.group({
      name: [contact?.name || '', Validators.required],
      phone: [contact?.phone || '', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      email: [contact?.email || '', Validators.email],
      role: [contact?.role || 'OWNER', Validators.required],
      isPrimary: [contact?.isPrimary || false]
    });

    this.contacts.push(contactGroup);
  }

  removeContact(index: number): void {
    this.contacts.removeAt(index);
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
  }

  saveProject(): void {
    // Debug: Check state when save is called
    console.log('saveProject called - isNewProject:', this.isNewProject, 'projectId:', this.projectId);

    if (this.projectForm.invalid) {
      this.markFormGroupTouched(this.projectForm);
      this.error = 'Please fill in all required fields correctly.';
      return;
    }

    this.saving = true;
    this.error = null;

    const projectData = this.projectForm.value;

    if (this.isNewProject) {
      this.landscapingService.createProject(projectData).subscribe({
        next: (project) => {
          this.saving = false;
          alert('Project created successfully!');
          this.router.navigate(['/landscaping/project', project._id]);
        },
        error: (err) => {
          this.saving = false;
          this.error = `Failed to create project: ${err.message || 'Unknown error'}`;
        }
      });
    } else if (this.projectId && this.projectId !== 'new') {
      this.landscapingService.updateProject(this.projectId, projectData).subscribe({
        next: (project) => {
          this.saving = false;
          this.project = project;
          alert('Project updated successfully!');
        },
        error: (err) => {
          this.saving = false;
          this.error = `Failed to update project: ${err.message || 'Unknown error'}`;
        }
      });
    } else {
      console.error('Unexpected state - isNewProject:', this.isNewProject, 'projectId:', this.projectId);
      this.saving = false;
      this.error = 'Unexpected state. Please refresh and try again.';
    }
  }

  getFormValidationErrors(): any {
    const errors: any = {};
    Object.keys(this.projectForm.controls).forEach(key => {
      const control = this.projectForm.get(key);
      if (control && control.errors) {
        errors[key] = control.errors;
      }
    });
    return errors;
  }

  cancelEdit(): void {
    if (this.isNewProject) {
      this.router.navigate(['/landscaping']);
    } else {
      this.isEditMode = false;
      if (this.project) {
        this.populateForm(this.project);
      }
    }
  }

  deleteProject(): void {
    if (!this.projectId || this.isNewProject) return;

    const projectName = this.project?.projectName || 'this project';
    if (confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      this.landscapingService.deleteProject(this.projectId).subscribe({
        next: () => {
          alert('Project deleted successfully!');
          this.router.navigate(['/landscaping']);
        },
        error: (err) => {
          this.error = 'Failed to delete project. Please try again.';
          console.error('Error deleting project:', err);
        }
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/landscaping']);
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  markFormGroupTouched(formGroup: FormGroup | FormArray): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup || control instanceof FormArray) {
        this.markFormGroupTouched(control);
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.projectForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.projectForm.get(fieldName);
    if (field?.hasError('required')) {
      return 'This field is required';
    }
    if (field?.hasError('email')) {
      return 'Invalid email format';
    }
    if (field?.hasError('pattern')) {
      return 'Invalid format';
    }
    if (field?.hasError('min')) {
      return 'Value must be positive';
    }
    return '';
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatCurrency(amount: number | undefined): string {
    if (!amount) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  }
}
