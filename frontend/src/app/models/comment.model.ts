export interface Mention { userId: string; name: string; }
export interface Reaction { userId: string; emoji: string; }

export interface Comment {
  _id: string;
  projectId: string;
  parentId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  mentions: Mention[];
  reactions: Reaction[];
  isEdited: boolean;
  isDeleted: boolean;
  replies?: Comment[];
  createdAt: string;
  updatedAt: string;
}
