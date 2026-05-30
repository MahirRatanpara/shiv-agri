import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FarmManagementService, FarmProject, FarmRegistrationPayload } from '../../services/farm-management.service';
import { User } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-farm-registration-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './farm-registration-form.html',
  styleUrl: './farm-registration-form.css'
})
export class FarmRegistrationFormComponent implements OnInit, OnChanges {
  @Input() mode: 'farmer' | 'manager' = 'farmer';
  @Input() action: 'create' | 'edit' = 'create';
  @Input() currentUser: User | null = null;
  @Input() initialData?: Partial<FarmRegistrationPayload> | FarmProject | null = null;
  @Input() isSubmitting = false;
  @Output() formSubmit = new EventEmitter<FarmRegistrationPayload>();
  @Output() cancel = new EventEmitter<void>();

  farmName = '';
  clientName = '';
  clientEmail = '';
  clientCountryCode = '+91';
  clientPhone = '';
  lookupInProgress = false;
  userResolved = false;
  // True when the entered phone matches no existing farmer — a new account will be
  // created on submit, so the manager fills in name (required) and email (optional).
  newFarmer = false;
  address = '';
  district = '';
  city = '';
  state = 'Gujarat';
  postalCode = '';
  mapUrl = '';
  totalArea: number | null = null;
  areaUnit: 'acres' | 'hectares' | 'sqmeters' = 'acres';
  cultivableArea: number | null = null;
  soilType = '';
  waterSources: string[] = [];
  irrigationSystem = '';
  terrainType = '';
  cropInput = '';
  crops: Array<{ name: string; variety?: string; season?: string; area?: number }> = [];
  description = '';
  notes = '';
  alternativeContact = '';
  visitFrequency = 0;
  startDate = '';
  expectedCompletionDate = '';
  errors: Record<string, string> = {};
  private lastResolvedPhone = '';
  availableWaterSources = ['Bore Well', 'Canal', 'River', 'Rainwater', 'Municipal', 'Mixed'];
  irrigationOptions = ['Drip', 'Sprinkler', 'Flood', 'Mixed', 'Manual'];
  terrainOptions = ['Flat', 'Sloped', 'Hilly', 'Mixed'];
  cropSeasonOptions = ['Kharif', 'Rabi', 'Zaid', 'Perennial'];
  countryCodeOptions = [
    { label: 'India (+91)', value: '+91' },
    { label: 'US/Canada (+1)', value: '+1' },
    { label: 'UK (+44)', value: '+44' },
    { label: 'UAE (+971)', value: '+971' },
    { label: 'Australia (+61)', value: '+61' }
  ];

  constructor(
    private farmService: FarmManagementService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.hydrateForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialData'] || changes['currentUser'] || changes['mode']) {
      this.hydrateForm();
    }
  }

  get submitLabel(): string {
    if (this.action === 'edit') {
      return this.mode === 'farmer' ? 'Submit for Approval' : 'Apply Edits';
    }

    return this.mode === 'farmer' ? 'Submit for Approval' : 'Create Farm';
  }

  private hydrateForm(): void {
    if (this.initialData) {
      this.patchFromInitial(this.initialData);
    }

    if (this.mode === 'manager' && this.clientPhone && this.clientName) {
      this.userResolved = true;
    }

    if (this.mode === 'farmer' && this.currentUser) {
      this.clientName = this.currentUser.name || '';
      this.clientEmail = this.currentUser.email || '';
      const phoneParts = this.splitPhoneNumber(this.currentUser.phoneNumber || '', this.currentUser.phoneCountryCode);
      this.clientCountryCode = phoneParts.countryCode;
      this.clientPhone = phoneParts.localNumber;
    }
  }

  private patchFromInitial(data: Partial<FarmRegistrationPayload> | FarmProject): void {
    this.farmName = data.name || this.farmName;
    this.clientName = data.clientName || this.clientName;
    this.clientEmail = data.clientEmail || this.clientEmail;
    if (data.clientPhone) {
      const phoneParts = this.splitPhoneNumber(data.clientPhone);
      this.clientCountryCode = phoneParts.countryCode;
      this.clientPhone = phoneParts.localNumber;
    }
    this.address = data.location?.address || this.address;
    this.city = data.location?.city || this.city;
    this.district = data.location?.district || this.district;
    this.state = data.location?.state || this.state;
    this.postalCode = data.location?.postalCode || this.postalCode;
    this.mapUrl = data.location?.mapUrl || this.mapUrl;
    this.totalArea = data.landDetails?.totalArea ?? this.totalArea;
    this.areaUnit = data.landDetails?.areaUnit || this.areaUnit;
    this.cultivableArea = data.landDetails?.cultivableArea ?? this.cultivableArea;
    this.soilType = data.landDetails?.soilType || this.soilType;
    this.waterSources = data.landDetails?.waterSource || this.waterSources;
    this.irrigationSystem = data.landDetails?.irrigationSystem || this.irrigationSystem;
    this.terrainType = data.landDetails?.terrainType || this.terrainType;
    this.crops = data.crops ? [...data.crops] : this.crops;
    this.description = data.description || this.description;
    this.notes = data.notes || this.notes;
    this.alternativeContact = data.alternativeContact || this.alternativeContact;
    this.visitFrequency = data.visitFrequency ?? this.visitFrequency;
    this.startDate = data.startDate || this.startDate;
    this.expectedCompletionDate = data.expectedCompletionDate || this.expectedCompletionDate;
  }

  addCrop(): void {
    const name = this.cropInput.trim();
    if (!name || this.crops.some((crop) => crop.name.toLowerCase() === name.toLowerCase())) return;
    this.crops = [...this.crops, { name }];
    this.cropInput = '';
  }

  removeCrop(cropName: string): void {
    this.crops = this.crops.filter((item) => item.name !== cropName);
  }

  toggleWaterSource(value: string): void {
    if (this.waterSources.includes(value)) {
      this.waterSources = this.waterSources.filter((source) => source !== value);
      return;
    }
    this.waterSources = [...this.waterSources, value];
  }

  onClientPhoneChange(): void {
    this.userResolved = false;
    this.newFarmer = false;
    this.lastResolvedPhone = '';
    delete this.errors['clientPhone'];
    delete this.errors['userResolved'];
  }

  resolveUserByPhone(showToast = false): void {
    const phone = this.combinedClientPhone();
    if (!phone || phone === this.lastResolvedPhone) {
      return;
    }

    this.lookupInProgress = true;
    this.farmService.lookupUserByPhone(phone).subscribe({
      next: (user) => {
        this.clientName = user.name;
        this.clientEmail = user.email;
        this.userResolved = true;
        this.newFarmer = false;
        this.lastResolvedPhone = phone;
        this.lookupInProgress = false;
        delete this.errors['clientPhone'];
        delete this.errors['userResolved'];
        if (showToast) {
          this.toastService.success('Farmer profile loaded from mobile number.');
        }
      },
      error: (error) => {
        this.lookupInProgress = false;
        this.userResolved = false;
        this.lastResolvedPhone = phone;
        if (error?.status === 404) {
          // No existing farmer — let the manager create one. Name/email become editable.
          this.newFarmer = true;
          delete this.errors['clientPhone'];
        } else {
          this.newFarmer = false;
          this.errors['clientPhone'] = error?.error?.error || 'Could not look up this mobile number.';
        }
      }
    });
  }

  submit(): void {
    if (!this.validate()) return;

    const ownerName = this.mode === 'farmer'
      ? this.currentUser?.name || this.clientName
      : this.clientName.trim();
    const resolvedPhone = this.mode === 'farmer'
      ? (this.currentUser?.phoneNumber || '')
      : this.combinedClientPhone();

    this.formSubmit.emit({
      name: this.farmName.trim(),
      clientName: ownerName?.trim(),
      clientEmail: (this.mode === 'farmer' ? this.currentUser?.email : this.clientEmail)?.trim(),
      clientPhone: resolvedPhone.trim(),
      category: 'FARM',
      projectType: 'farm',
      budget: 0,
      location: {
        address: this.address.trim(),
        city: this.city.trim(),
        district: this.district.trim(),
        state: this.state.trim(),
        postalCode: this.postalCode.trim(),
        mapUrl: this.mapUrl.trim()
      },
      landDetails: {
        totalArea: Number(this.totalArea),
        areaUnit: this.areaUnit,
        soilType: this.soilType.trim(),
        cultivableArea: this.cultivableArea || undefined,
        waterSource: this.waterSources,
        irrigationSystem: this.irrigationSystem || undefined,
        terrainType: this.terrainType || undefined
      },
      crops: this.crops.map((crop) => ({
        name: crop.name,
        variety: crop.variety?.trim() || undefined,
        season: crop.season || undefined,
        area: crop.area || undefined
      })),
      alternativeContact: this.alternativeContact.trim() || undefined,
      description: this.description.trim() || undefined,
      notes: this.notes.trim() || undefined,
      startDate: this.startDate || undefined,
      expectedCompletionDate: this.expectedCompletionDate || undefined,
      visitFrequency: this.visitFrequency || undefined
    });
  }

  private validate(): boolean {
    const errors: Record<string, string> = {};

    if (!this.farmName.trim()) errors['farmName'] = 'Farm name is required.';
    if (this.mode === 'manager' && !this.clientPhone.trim()) errors['clientPhone'] = 'Farmer mobile number is required.';
    if (this.mode === 'manager' && this.newFarmer && !this.clientName.trim()) errors['clientName'] = 'Farmer name is required to create a new account.';
    if (this.mode === 'farmer' && !(this.currentUser?.phoneNumber || '').trim()) errors['clientPhone'] = 'Your profile needs a mobile number before registration.';
    if (!this.address.trim()) errors['address'] = 'Address is required.';
    if (!this.district.trim()) errors['district'] = 'District is required.';
    if (!this.totalArea || this.totalArea <= 0) errors['totalArea'] = 'Enter a valid total area.';
    if (!this.soilType.trim()) errors['soilType'] = 'Soil type is required.';
    if (!this.waterSources.length) errors['waterSources'] = 'Select at least one water source.';
    if (!this.crops.length) errors['crops'] = 'Add at least one crop.';

    this.errors = errors;
    return Object.keys(errors).length === 0;
  }

  private combinedClientPhone(): string {
    const localNumber = this.clientPhone.trim();
    if (!localNumber) return '';
    if (localNumber.startsWith('+')) return localNumber;
    return `${this.clientCountryCode} ${localNumber}`.trim();
  }

  private splitPhoneNumber(phoneNumber: string, savedCountryCode?: string): { countryCode: string; localNumber: string } {
    const trimmedPhone = phoneNumber.trim();
    const matchedCode = savedCountryCode ||
      this.countryCodeOptions
        .map((option) => option.value)
        .sort((a, b) => b.length - a.length)
        .find((code) => trimmedPhone.startsWith(code));
    const countryCode = matchedCode || '+91';
    const localNumber = trimmedPhone.startsWith(countryCode)
      ? trimmedPhone.slice(countryCode.length).trim()
      : trimmedPhone;

    return { countryCode, localNumber };
  }
}
