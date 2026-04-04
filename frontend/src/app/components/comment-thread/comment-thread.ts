import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Comment } from '../../models/comment.model';
import { CommentService } from '../../services/comment.service';

@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comment-thread.html',
  styleUrl: './comment-thread.css'
})
export class CommentThreadComponent implements OnInit, OnDestroy {
  @Input() projectId: string = '';

  private destroy$ = new Subject<void>();

  comments: Comment[] = [];
  loading = false;
  newCommentContent = '';
  submitting = false;

  replyingTo: string | null = null;
  replyContent = '';

  editingId: string | null = null;
  editContent = '';

  currentUserId = '';

  emojiOptions = ['👍', '❤️', '😄', '🎉', '🤔', '👀'];

  constructor(private commentService: CommentService) {}

  ngOnInit(): void {
    this.loadComments();
  }

  loadComments(): void {
    if (!this.projectId) return;
    this.loading = true;
    this.commentService.getComments(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.comments = res.comments;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });
  }

  submitComment(): void {
    if (!this.newCommentContent.trim()) return;
    this.submitting = true;
    const mentions = this.extractMentions(this.newCommentContent);
    this.commentService.createComment({
      projectId: this.projectId,
      content: this.newCommentContent,
      mentions
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (comment) => {
          this.comments.unshift(comment);
          this.newCommentContent = '';
          this.submitting = false;
        },
        error: () => {
          this.submitting = false;
        }
      });
  }

  startReply(commentId: string): void {
    this.replyingTo = this.replyingTo === commentId ? null : commentId;
    this.replyContent = '';
  }

  submitReply(parentId: string): void {
    if (!this.replyContent.trim()) return;
    const mentions = this.extractMentions(this.replyContent);
    this.commentService.createComment({
      projectId: this.projectId,
      parentId,
      content: this.replyContent,
      mentions
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (reply) => {
          const parent = this.comments.find(c => c._id === parentId);
          if (parent) {
            if (!parent.replies) parent.replies = [];
            parent.replies.push(reply);
          }
          this.replyingTo = null;
          this.replyContent = '';
        }
      });
  }

  startEdit(comment: Comment): void {
    this.editingId = comment._id;
    this.editContent = comment.content;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editContent = '';
  }

  saveEdit(commentId: string): void {
    if (!this.editContent.trim()) return;
    this.commentService.updateComment(commentId, this.editContent)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const comment = this.findComment(commentId);
          if (comment) {
            comment.content = updated.content;
            comment.isEdited = true;
          }
          this.editingId = null;
          this.editContent = '';
        }
      });
  }

  deleteComment(commentId: string): void {
    if (!confirm('Delete this comment?')) return;
    this.commentService.deleteComment(commentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.comments = this.comments.filter(c => c._id !== commentId);
          this.comments.forEach(c => {
            if (c.replies) {
              c.replies = c.replies.filter(r => r._id !== commentId);
            }
          });
        }
      });
  }

  addReaction(commentId: string, emoji: string): void {
    this.commentService.addReaction(commentId, emoji)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const comment = this.findComment(commentId);
          if (comment) {
            comment.reactions = updated.reactions;
          }
        }
      });
  }

  getReactionCounts(reactions: { userId: string; emoji: string }[]): { emoji: string; count: number }[] {
    const counts = new Map<string, number>();
    reactions.forEach(r => {
      counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
  }

  getInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  getAvatarColor(name: string): string {
    const colors = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)',
      'linear-gradient(135deg, #a18cd1, #fbc2eb)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  private findComment(id: string): Comment | undefined {
    let found = this.comments.find(c => c._id === id);
    if (!found) {
      for (const c of this.comments) {
        if (c.replies) {
          found = c.replies.find(r => r._id === id);
          if (found) break;
        }
      }
    }
    return found;
  }

  private extractMentions(content: string): { userId: string; name: string }[] {
    const regex = /@(\w+)/g;
    const mentions: { userId: string; name: string }[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      mentions.push({ userId: match[1], name: match[1] });
    }
    return mentions;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
