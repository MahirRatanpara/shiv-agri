export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'missed';
export type VisitType = 'routine' | 'emergency' | 'follow_up' | 'initial';
export type CropHealth = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface VisitIssue {
  type: string;
  severity: Severity;
  description: string;
  affectedArea?: string;
}

export interface Recommendation {
  action: string;
  product?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  priority: Priority;
}

export interface Inspection {
  cropHealth?: CropHealth;
  soilCondition?: string;
  waterLevel?: string;
  pestPresence?: boolean;
  diseasePresence?: boolean;
  weatherCondition?: string;
  observations?: string[];
  photos?: string[];
}

export interface Diagnosis {
  issues?: VisitIssue[];
  labTestsRequired?: string[];
}

export interface Prescription {
  recommendations?: Recommendation[];
  nextVisitSuggested?: string;
  followUpRequired?: boolean;
}

export interface Visit {
  _id: string;
  projectId: string;
  visitNumber: number;
  scheduledDate: string;
  actualDate?: string;
  status: VisitStatus;
  type: VisitType;
  assignedTo?: { _id: string; name: string; email?: string; profilePhoto?: string };
  assignedToName?: string;
  inspection?: Inspection;
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  notes?: string;
  duration?: number;
  location?: { latitude: number; longitude: number };
  completedAt?: string;
  createdBy?: { _id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface VisitStats {
  total: number;
  completed: number;
  missed: number;
  cancelled: number;
  avgDuration: number;
}

export interface VisitListResponse {
  success: boolean;
  data: Visit[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}
