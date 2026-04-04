export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ChecklistItem { text: string; isDone: boolean; }

export interface Task {
  _id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: { _id: string; name: string };
  assignedToName?: string;
  dueDate?: string;
  checklist: ChecklistItem[];
  tags: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStats {
  todo: number;
  in_progress: number;
  review: number;
  done: number;
}
