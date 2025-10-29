export enum ProjectStatus {
  COMPLETED = 'COMPLETED',
  RUNNING = 'RUNNING',
  UPCOMING = 'UPCOMING'
}

export enum FileType {
  DESIGN_FILE = 'DESIGN_FILE',
  DRONE_VIDEO = 'DRONE_VIDEO',
  QUOTATION = 'QUOTATION',
  INVOICE = 'INVOICE',
  AUTOCAD = 'AUTOCAD',
  PDF = 'PDF',
  IMAGE = 'IMAGE'
}

export interface Location {
  address: string;
  city: string;
  state: string;
  pincode: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  mapUrl?: string;
}

export interface LandInfo {
  size: number; // in square feet or acres
  unit: 'sqft' | 'acres' | 'sqm';
  soilType?: string;
  irrigationType?: string;
  waterSource?: string;
  coordinates?: string;
}

export interface Contact {
  name: string;
  phone: string;
  email?: string;
  role: 'OWNER' | 'ARCHITECT' | 'WORKER' | 'SUPERVISOR' | 'OTHER';
  isPrimary?: boolean;
}

export interface FileUpload {
  _id?: string;
  fileName: string;
  fileType: FileType;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  uploadedBy?: string;
}

export interface Project {
  _id?: string;
  projectName: string;
  farmName?: string;
  status: ProjectStatus;
  location: Location;
  landInfo: LandInfo;
  contacts: Contact[];
  description?: string;
  startDate?: Date;
  endDate?: Date;
  estimatedCost?: number;
  actualCost?: number;
  files: FileUpload[];
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface ProjectFilter {
  status?: ProjectStatus;
  searchTerm?: string;
  city?: string;
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'projectName' | 'createdAt' | 'status' | 'startDate';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CommunicationRequest {
  projectId: string;
  fileIds: string[];
  recipients: string[]; // email addresses or phone numbers
  channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  message?: string;
  subject?: string;
}
