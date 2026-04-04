// ─── Core Enums ───

export type ProjectCategory = 'FARM' | 'LANDSCAPING' | 'GARDENING';
export type ProjectStatus = 'Upcoming' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ContactRole = 'owner' | 'manager' | 'architect' | 'supervisor' | 'worker' | 'consultant' | 'vendor' | 'other';
export type CropSeason = 'kharif' | 'rabi' | 'zaid' | 'perennial' | '';
export type AreaUnit = 'acres' | 'hectares' | 'sqm' | 'sqft' | 'bigha' | 'vigha' | 'guntha';
export type ViewMode = 'grid' | 'list';
export type SortField = 'updatedAt' | 'createdAt' | 'name' | 'budget' | 'status' | 'location' | 'clientName';
export type SortOrder = 'asc' | 'desc';

// ─── Sub-documents ───

export interface ProjectContact {
  _id?: string;
  fullName: string;
  designation?: string;
  phone?: string;
  email?: string;
  role: ContactRole;
  isPrimary: boolean;
  isActive: boolean;
}

export interface Milestone {
  _id?: string;
  name: string;
  date?: string;
  description?: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface BudgetCategory {
  category: string;
  percentage: number;
  amount: number;
}

export interface Crop {
  _id?: string;
  name: string;
  variety?: string;
  season: CropSeason;
  plantingDate?: string;
  expectedHarvestDate?: string;
  area?: number;
}

export interface ProjectImage {
  _id?: string;
  url: string;
  caption?: string;
  uploadedAt?: string;
}

export interface ProjectLocation {
  address?: string;
  village?: string;
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  pincode?: string;
  surveyNumber?: string;
  coordinates?: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  mapUrl?: string;
}

export interface LandDetails {
  totalArea?: number;
  areaUnit?: AreaUnit;
  cultivableArea?: number;
  cultivablePercentage?: number;
  soilType?: string;
  waterSource?: string[];
  irrigationSystem?: string;
  terrainType?: string;
}

export interface VisitFrequencyConfig {
  frequency?: string;
  customDays?: number;
  preferredDay?: string;
  preferredTime?: string;
}

export interface UserRef {
  _id: string;
  name: string;
  email?: string;
  profilePhoto?: string;
}

// ─── Main Project Model ───

export interface Project {
  _id: string;
  name: string;
  category: ProjectCategory;
  status: ProjectStatus;
  description?: string;
  notes?: string;
  priority: ProjectPriority;
  tags: string[];

  // Client
  clientId?: string;
  clientName?: string;
  clientAvatar?: string;
  clientEmail?: string;
  clientPhone?: string;
  alternativeContact?: string;

  // Location
  location: ProjectLocation;

  // Land
  landDetails: LandDetails;

  // Budget
  budget: number;
  expenses: number;
  income: number;
  budgetUtilizationPercentage: number;
  budgetCategories: BudgetCategory[];

  // Timeline
  startDate?: string;
  completionDate?: string;
  expectedCompletionDate?: string;

  // Team
  assignedTo?: UserRef;
  assignedToName?: string;
  projectManager?: UserRef;
  fieldWorkers: UserRef[];
  consultants: UserRef[];
  assignedTeam: UserRef[];

  // Sub-documents
  contacts: ProjectContact[];
  milestones: Milestone[];
  crops: Crop[];
  images: ProjectImage[];

  // Visits
  totalVisitsPlanned: number;
  totalVisitsCompleted: number;
  visitCompletionPercentage: number;
  visitFrequencyConfig: VisitFrequencyConfig;
  numberOfYears?: number;

  // Media
  coverImage?: string;
  thumbnailUrl?: string;

  // Favorites
  isFavorite: string[];

  // Draft
  isDraft: boolean;

  // Size (legacy)
  size?: { value?: number; unit?: string };

  // Virtuals
  fullLocation?: string;
  budgetRemaining?: number;
  isOverBudget?: boolean;
  daysToCompletion?: number;
  isOverdue?: boolean;

  // Audit
  createdBy?: UserRef;
  lastUpdatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── API Request/Response Types ───

export interface ProjectFilters {
  search?: string;
  category?: ProjectCategory;
  categoryInclude?: ProjectCategory[];
  categoryExclude?: ProjectCategory[];
  status?: ProjectStatus | ProjectStatus[];
  city?: string;
  state?: string;
  clientId?: string;
  assignedTo?: string;
  assignedTeam?: string[];
  projectManager?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  isFavorite?: boolean;
  isDraft?: boolean;
}

export interface ProjectSortOptions {
  sortBy: SortField;
  sortOrder: SortOrder;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ProjectListResponse {
  success: boolean;
  data: Project[];
  pagination: Pagination;
}

export interface ProjectResponse {
  success: boolean;
  data: Project;
  message?: string;
}

export interface DashboardStats {
  totalProjects: number;
  totalBudget: number;
  totalExpenses: number;
  totalIncome: number;
  statusBreakdown: Record<string, number>;
  activeProjects: number;
  completedProjects: number;
}

export interface StatsResponse {
  success: boolean;
  data: DashboardStats;
}

export interface Activity {
  _id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  actionType: string;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ActivityResponse {
  success: boolean;
  data: Activity[];
  pagination: Pagination;
}
