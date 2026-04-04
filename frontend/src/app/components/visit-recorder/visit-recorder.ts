import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  Visit, Inspection, Diagnosis, Prescription,
  CropHealth, Severity, Priority, VisitIssue, Recommendation
} from '../../models/visit.model';
import { VisitService } from '../../services/visit.service';

@Component({
  selector: 'app-visit-recorder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './visit-recorder.html',
  styleUrl: './visit-recorder.css'
})
export class VisitRecorderComponent implements OnChanges, OnDestroy {
  @Input() visit: Visit | null = null;
  @Input() visible = false;

  @Output() completed = new EventEmitter<Visit>();
  @Output() cancelled = new EventEmitter<void>();

  currentStep = 1;
  loading = false;

  // Step 1 — Inspection
  inspection: Inspection = {
    cropHealth: undefined,
    soilCondition: '',
    waterLevel: '',
    pestPresence: false,
    diseasePresence: false,
    weatherCondition: '',
    observations: [],
    photos: []
  };
  newObservation = '';

  // Step 2 — Diagnosis
  diagnosis: Diagnosis = {
    issues: [],
    labTestsRequired: []
  };
  newLabTest = '';

  // Step 3 — Prescription
  prescription: Prescription = {
    recommendations: [],
    nextVisitSuggested: '',
    followUpRequired: false
  };
  duration: number | null = null;
  notes = '';

  cropHealthOptions: CropHealth[] = ['excellent', 'good', 'fair', 'poor', 'critical'];
  severityOptions: Severity[] = ['low', 'medium', 'high', 'critical'];
  priorityOptions: Priority[] = ['low', 'medium', 'high', 'urgent'];

  private destroy$ = new Subject<void>();

  constructor(private visitService: VisitService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.currentStep = 1;
      this.prefillFromVisit();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Navigation ───

  nextStep(): void {
    if (this.currentStep < 3) this.currentStep++;
  }

  previousStep(): void {
    if (this.currentStep > 1) this.currentStep--;
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  // ─── Step 1: Inspection ───

  setCropHealth(health: CropHealth): void {
    this.inspection.cropHealth = health;
  }

  getCropHealthColor(health: CropHealth): string {
    const map: Record<CropHealth, string> = {
      excellent: '#10b981',
      good: '#22c55e',
      fair: '#f59e0b',
      poor: '#f97316',
      critical: '#ef4444'
    };
    return map[health];
  }

  addObservation(): void {
    const text = this.newObservation.trim();
    if (text) {
      this.inspection.observations = [...(this.inspection.observations || []), text];
      this.newObservation = '';
    }
  }

  removeObservation(index: number): void {
    this.inspection.observations = (this.inspection.observations || []).filter((_, i) => i !== index);
  }

  // ─── Step 2: Diagnosis ───

  addIssue(): void {
    const issue: VisitIssue = { type: '', severity: 'medium', description: '', affectedArea: '' };
    this.diagnosis.issues = [...(this.diagnosis.issues || []), issue];
  }

  removeIssue(index: number): void {
    this.diagnosis.issues = (this.diagnosis.issues || []).filter((_, i) => i !== index);
  }

  addLabTest(): void {
    const text = this.newLabTest.trim();
    if (text) {
      this.diagnosis.labTestsRequired = [...(this.diagnosis.labTestsRequired || []), text];
      this.newLabTest = '';
    }
  }

  removeLabTest(index: number): void {
    this.diagnosis.labTestsRequired = (this.diagnosis.labTestsRequired || []).filter((_, i) => i !== index);
  }

  // ─── Step 3: Prescription ───

  addRecommendation(): void {
    const rec: Recommendation = { action: '', product: '', dosage: '', frequency: '', duration: '', priority: 'medium' };
    this.prescription.recommendations = [...(this.prescription.recommendations || []), rec];
  }

  removeRecommendation(index: number): void {
    this.prescription.recommendations = (this.prescription.recommendations || []).filter((_, i) => i !== index);
  }

  // ─── Submit ───

  onComplete(): void {
    if (!this.visit) return;

    this.loading = true;

    const payload: Record<string, unknown> = {
      inspection: this.inspection,
      diagnosis: this.diagnosis,
      prescription: this.prescription,
      notes: this.notes || undefined,
      duration: this.duration || undefined
    };

    this.visitService.completeVisit(this.visit._id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedVisit) => {
          this.loading = false;
          this.completed.emit(updatedVisit);
        },
        error: () => {
          this.loading = false;
        }
      });
  }

  // ─── Prefill ───

  private prefillFromVisit(): void {
    if (!this.visit) {
      this.resetForm();
      return;
    }

    this.inspection = {
      cropHealth: this.visit.inspection?.cropHealth,
      soilCondition: this.visit.inspection?.soilCondition || '',
      waterLevel: this.visit.inspection?.waterLevel || '',
      pestPresence: this.visit.inspection?.pestPresence || false,
      diseasePresence: this.visit.inspection?.diseasePresence || false,
      weatherCondition: this.visit.inspection?.weatherCondition || '',
      observations: [...(this.visit.inspection?.observations || [])],
      photos: [...(this.visit.inspection?.photos || [])]
    };

    this.diagnosis = {
      issues: (this.visit.diagnosis?.issues || []).map(i => ({ ...i })),
      labTestsRequired: [...(this.visit.diagnosis?.labTestsRequired || [])]
    };

    this.prescription = {
      recommendations: (this.visit.prescription?.recommendations || []).map(r => ({ ...r })),
      nextVisitSuggested: this.visit.prescription?.nextVisitSuggested || '',
      followUpRequired: this.visit.prescription?.followUpRequired || false
    };

    this.duration = this.visit.duration || null;
    this.notes = this.visit.notes || '';
  }

  private resetForm(): void {
    this.inspection = { cropHealth: undefined, soilCondition: '', waterLevel: '', pestPresence: false, diseasePresence: false, weatherCondition: '', observations: [], photos: [] };
    this.diagnosis = { issues: [], labTestsRequired: [] };
    this.prescription = { recommendations: [], nextVisitSuggested: '', followUpRequired: false };
    this.duration = null;
    this.notes = '';
    this.newObservation = '';
    this.newLabTest = '';
  }
}
