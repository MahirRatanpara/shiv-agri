import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AreaUnit, FarmManagementService, FarmProject, FarmRegistrationPayload } from '../../services/farm-management.service';
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
  // Snapshot of the email at the time the linked farmer was loaded. When
  // blank, the form lets the user add one (and the backend backfills it on
  // save). When non-blank, the email stays read-only — changing an
  // already-set email is an admin-only operation via the user-management
  // panel.
  initialClientEmail = '';
  clientCountryCode = '+91';
  clientPhone = '';
  lookupInProgress = false;
  userResolved = false;
  // True when the entered phone matches no existing farmer — a new account will be
  // created on submit, so the manager fills in name (required) and email (optional).
  newFarmer = false;
  address = '';
  taluka = '';
  district = '';
  city = '';
  state = 'Gujarat';
  postalCode = '';
  mapUrl = '';
  detectingLocation = false;
  latitude: number | null = null;
  longitude: number | null = null;
  totalArea: number | null = null;
  areaUnit: AreaUnit = 'acres';
  cultivableArea: number | null = null;
  soilType = '';
  // Multi-select water sources (Bore, Well, Canal, ...). Replaces the
  // legacy single irrigationSystem string. Legacy data is hydrated into
  // this array in patchFromInitial().
  irrigationSources: string[] = [];
  // How the field is watered (Drip, Flood, Sprinkler, ...).
  irrigationMethod = '';
  terrainType = '';
  transformerHp: number | null = null;
  motorCount: number | null = null;
  totalMotorHp: number | null = null;
  needsLandscapingConsultancy = false;
  isOnlineVisit = false;
  cropInput = '';
  crops: Array<{
    name: string;
    variety?: string;
    season?: string;
    area?: number;
    cropAge?: number;
    totalTrees?: number;
    spacing?: string;
  }> = [];
  description = '';
  notes = '';
  alternativeContact = '';
  visitFrequency = 0;
  startDate = '';
  expectedCompletionDate = '';
  errors: Record<string, string> = {};
  private lastResolvedPhone = '';
  // Sources can be combined (e.g., Bore + Well). "Mixed" is intentionally
  // dropped — the multi-select makes it redundant.
  irrigationSourceOptions = ['Bore', 'Well', 'Canal', 'River', 'Pond', 'Tank', 'Rainwater'];
  irrigationMethodOptions = ['Drip', 'Flood', 'Sprinkler', 'Furrow', 'Micro-sprinkler', 'Manual'];
  terrainOptions = ['Flat', 'Sloped', 'Hilly', 'Mixed'];
  cropSeasonOptions = ['Kharif', 'Rabi', 'Zaid', 'Perennial'];
  areaUnitOptions: Array<{ value: AreaUnit; label: string }> = [
    { value: 'acres', label: 'Acres' },
    { value: 'hectares', label: 'Hectares' },
    { value: 'sqmeters', label: 'Sq. meters' },
    { value: 'vigha-16', label: 'Vigha (16 gutha)' },
    { value: 'vigha-24', label: 'Vigha (24 gutha)' }
  ];
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

  /**
   * The email input is editable in any of these cases:
   *  - Manager mode + brand-new farmer (no resolved user yet) — always free.
   *  - Manager mode + resolved farmer who currently has NO email on record.
   *  - Farmer mode + the user's profile email is currently blank.
   * Once an email is on file, it stays read-only — admin can change it via
   * the user-management identity edit panel.
   */
  get isClientEmailLocked(): boolean {
    if (this.mode === 'manager') {
      if (!this.userResolved) return false;
      return !!this.initialClientEmail;
    }
    // Farmer mode: locked only when a non-blank email is on record.
    return !!(this.currentUser?.email || '').trim();
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
      this.initialClientEmail = this.clientEmail;
      const phoneParts = this.splitPhoneNumber(this.currentUser.phoneNumber || '', this.currentUser.phoneCountryCode);
      this.clientCountryCode = phoneParts.countryCode;
      this.clientPhone = phoneParts.localNumber;
    }
  }

  private patchFromInitial(data: Partial<FarmRegistrationPayload> | FarmProject): void {
    this.farmName = data.name || this.farmName;
    this.clientName = data.clientName || this.clientName;
    this.clientEmail = data.clientEmail || this.clientEmail;
    // Snapshot whatever email the linked farmer already had so the
    // template can keep it editable when it was blank coming in.
    this.initialClientEmail = (data.clientEmail || '').trim();
    if (data.clientPhone) {
      const phoneParts = this.splitPhoneNumber(data.clientPhone);
      this.clientCountryCode = phoneParts.countryCode;
      this.clientPhone = phoneParts.localNumber;
    }
    this.address = data.location?.address || this.address;
    this.taluka = data.location?.taluka || this.taluka;
    this.city = data.location?.city || this.city;
    this.district = data.location?.district || this.district;
    this.state = data.location?.state || this.state;
    this.postalCode = data.location?.postalCode || this.postalCode;
    this.mapUrl = data.location?.mapUrl || this.mapUrl;
    const existingCoords = data.location?.coordinates?.coordinates;
    if (Array.isArray(existingCoords) && existingCoords.length === 2) {
      this.longitude = existingCoords[0] ?? this.longitude;
      this.latitude = existingCoords[1] ?? this.latitude;
    }
    this.totalArea = data.landDetails?.totalArea ?? this.totalArea;
    this.areaUnit = data.landDetails?.areaUnit || this.areaUnit;
    this.cultivableArea = data.landDetails?.cultivableArea ?? this.cultivableArea;
    this.soilType = data.landDetails?.soilType || this.soilType;
    // Hydrate multi-select sources: prefer the new array; fall back to
    // legacy single string (split on comma/semicolon for old saved data).
    const sourcesField = (data.landDetails as any)?.irrigationSources;
    if (Array.isArray(sourcesField) && sourcesField.length) {
      this.irrigationSources = sourcesField.filter(Boolean);
    } else if (data.landDetails?.irrigationSystem) {
      this.irrigationSources = data.landDetails.irrigationSystem
        .split(/[,;/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    this.irrigationMethod = (data.landDetails as any)?.irrigationMethod || this.irrigationMethod;
    this.terrainType = data.landDetails?.terrainType || this.terrainType;
    this.transformerHp = data.electricity?.transformerHp ?? this.transformerHp;
    this.motorCount = data.electricity?.motorCount ?? this.motorCount;
    this.totalMotorHp = data.electricity?.totalMotorHp ?? this.totalMotorHp;
    this.needsLandscapingConsultancy = data.needsLandscapingConsultancy ?? this.needsLandscapingConsultancy;
    this.isOnlineVisit = data.isOnlineVisit ?? this.isOnlineVisit;
    this.crops = data.crops ? [...data.crops] : this.crops;
    this.description = data.description || this.description;
    this.notes = data.notes || this.notes;
    this.alternativeContact = data.alternativeContact || this.alternativeContact;
    this.visitFrequency = data.visitFrequency ?? this.visitFrequency;
    this.startDate = data.startDate || this.startDate;
    this.expectedCompletionDate = data.expectedCompletionDate || this.expectedCompletionDate;
  }

  onMapUrlChange(): void {
    // Clear cached coordinates so backend re-parses from the new URL
    this.latitude = null;
    this.longitude = null;
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.toastService.error('Geolocation is not supported by this browser.');
      return;
    }
    this.detectingLocation = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.latitude = latitude;
        this.longitude = longitude;
        this.mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        this.detectingLocation = false;
        this.toastService.success('Current location captured.');
      },
      (error) => {
        this.detectingLocation = false;
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission denied. Enable it in your browser settings.'
          : 'Unable to determine current location.';
        this.toastService.error(message);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
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

  /** Toggle an irrigation source chip on/off. */
  toggleIrrigationSource(source: string): void {
    const idx = this.irrigationSources.indexOf(source);
    if (idx === -1) {
      this.irrigationSources = [...this.irrigationSources, source];
    } else {
      this.irrigationSources = this.irrigationSources.filter((s) => s !== source);
    }
    delete this.errors['irrigationSources'];
  }

  isIrrigationSourceSelected(source: string): boolean {
    return this.irrigationSources.includes(source);
  }

  onClientPhoneChange(): void {
    this.userResolved = false;
    this.newFarmer = false;
    this.lastResolvedPhone = '';
    this.initialClientEmail = '';
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
        this.clientEmail = user.email || '';
        // Capture whether this farmer arrived with an email on file.
        // The template uses this to keep the email editable when blank.
        this.initialClientEmail = this.clientEmail;
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

    const electricity = (this.transformerHp != null || this.motorCount != null || this.totalMotorHp != null)
      ? {
          transformerHp: this.transformerHp ?? undefined,
          motorCount: this.motorCount ?? undefined,
          totalMotorHp: this.totalMotorHp ?? undefined
        }
      : undefined;

    // In farmer mode we trust the user's profile email when it's already set,
    // but fall through to whatever they typed in the form so they can supply
    // a brand-new email when their profile email is blank (the backend then
    // auto-links it to their account via resolveOrCreateFarmer/email backfill).
    const farmerEmail = (this.currentUser?.email || '').trim() || this.clientEmail.trim();
    const submittedEmail = (this.mode === 'farmer' ? farmerEmail : this.clientEmail)?.trim();

    this.formSubmit.emit({
      name: this.farmName.trim(),
      clientName: ownerName?.trim(),
      clientEmail: submittedEmail,
      clientPhone: resolvedPhone.trim(),
      category: 'FARM',
      projectType: 'farm',
      budget: 0,
      location: {
        address: this.address.trim(),
        taluka: this.taluka.trim() || undefined,
        city: this.city.trim(),
        district: this.district.trim(),
        state: this.state.trim(),
        postalCode: this.postalCode.trim(),
        mapUrl: this.mapUrl.trim(),
        coordinates: (this.latitude != null && this.longitude != null)
          ? { type: 'Point', coordinates: [this.longitude, this.latitude] }
          : undefined
      },
      landDetails: {
        totalArea: Number(this.totalArea),
        areaUnit: this.areaUnit,
        soilType: this.soilType.trim(),
        cultivableArea: this.cultivableArea || undefined,
        // Multi-select sources replace the legacy single string. The
        // backend pre-save hook keeps `irrigationSystem` mirrored for any
        // older readers.
        irrigationSources: this.irrigationSources.length ? this.irrigationSources : undefined,
        irrigationMethod: this.irrigationMethod || undefined,
        terrainType: this.terrainType || undefined
      } as any,
      electricity,
      needsLandscapingConsultancy: this.needsLandscapingConsultancy,
      isOnlineVisit: this.isOnlineVisit,
      crops: this.crops.map((crop) => ({
        name: crop.name,
        variety: crop.variety?.trim() || undefined,
        season: crop.season || undefined,
        area: crop.area || undefined,
        cropAge: crop.cropAge ?? undefined,
        totalTrees: crop.totalTrees ?? undefined,
        spacing: crop.spacing?.trim() || undefined
      })),
      alternativeContact: this.alternativeContact.trim() || undefined,
      description: this.description.trim() || undefined,
      notes: this.notes.trim() || undefined,
      startDate: this.startDate || undefined,
      expectedCompletionDate: this.expectedCompletionDate || undefined,
      visitFrequency: this.isOnlineVisit ? undefined : (this.visitFrequency || undefined)
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
    if (!this.irrigationSources.length) errors['irrigationSources'] = 'Select at least one irrigation source.';
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
