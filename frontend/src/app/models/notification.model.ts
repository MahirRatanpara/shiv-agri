export type NotificationType = 'comment' | 'mention' | 'task_assigned' | 'visit_scheduled' | 'project_update' | 'milestone' | 'system';

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  projectId?: string;
  referenceId?: string;
  referenceType?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}
