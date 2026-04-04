import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Task, TaskStatus, TaskPriority, TaskStats } from '../../models/task.model';
import { TaskService } from '../../services/task.service';

interface Column {
  status: TaskStatus;
  label: string;
  tasks: Task[];
}

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-board.html',
  styleUrl: './task-board.css'
})
export class TaskBoardComponent implements OnInit, OnDestroy {
  @Input() projectId: string = '';

  private destroy$ = new Subject<void>();

  columns: Column[] = [
    { status: 'todo', label: 'To Do', tasks: [] },
    { status: 'in_progress', label: 'In Progress', tasks: [] },
    { status: 'review', label: 'Review', tasks: [] },
    { status: 'done', label: 'Done', tasks: [] }
  ];

  stats: TaskStats = { todo: 0, in_progress: 0, review: 0, done: 0 };
  loading = false;

  addingToColumn: TaskStatus | null = null;
  newTaskTitle = '';
  newTaskPriority: TaskPriority = 'medium';

  expandedTaskId: string | null = null;
  editingTask: Partial<Task> | null = null;

  constructor(private taskService: TaskService) {}

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    if (!this.projectId) return;
    this.loading = true;
    this.taskService.getTasks(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.distributeTasksToColumns(res.tasks);
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });

    this.taskService.getStats(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.stats = stats;
        }
      });
  }

  private distributeTasksToColumns(tasks: Task[]): void {
    this.columns.forEach(col => col.tasks = []);
    tasks.forEach(task => {
      const col = this.columns.find(c => c.status === task.status);
      if (col) col.tasks.push(task);
    });
  }

  startAddTask(status: TaskStatus): void {
    this.addingToColumn = status;
    this.newTaskTitle = '';
    this.newTaskPriority = 'medium';
  }

  cancelAddTask(): void {
    this.addingToColumn = null;
    this.newTaskTitle = '';
  }

  createTask(status: TaskStatus): void {
    if (!this.newTaskTitle.trim()) return;
    this.taskService.createTask({
      projectId: this.projectId,
      title: this.newTaskTitle,
      status,
      priority: this.newTaskPriority,
      checklist: [],
      tags: []
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (task) => {
          const col = this.columns.find(c => c.status === status);
          if (col) col.tasks.push(task);
          this.updateStats();
          this.cancelAddTask();
        }
      });
  }

  moveTask(task: Task, newStatus: TaskStatus): void {
    const oldStatus = task.status;
    this.taskService.updateTask(task._id, { status: newStatus })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const oldCol = this.columns.find(c => c.status === oldStatus);
          if (oldCol) {
            oldCol.tasks = oldCol.tasks.filter(t => t._id !== task._id);
          }
          const newCol = this.columns.find(c => c.status === newStatus);
          if (newCol) {
            newCol.tasks.push({ ...task, ...updated, status: newStatus });
          }
          this.updateStats();
        }
      });
  }

  toggleTaskExpand(taskId: string): void {
    this.expandedTaskId = this.expandedTaskId === taskId ? null : taskId;
  }

  deleteTask(task: Task, event: Event): void {
    event.stopPropagation();
    if (!confirm('Delete this task?')) return;
    this.taskService.deleteTask(task._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const col = this.columns.find(c => c.status === task.status);
          if (col) {
            col.tasks = col.tasks.filter(t => t._id !== task._id);
          }
          this.updateStats();
        }
      });
  }

  toggleChecklistItem(task: Task, index: number): void {
    const newVal = !task.checklist[index].isDone;
    this.taskService.updateChecklist(task._id, index, newVal)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          task.checklist[index].isDone = newVal;
        }
      });
  }

  getChecklistProgress(task: Task): number {
    if (!task.checklist || task.checklist.length === 0) return 0;
    const done = task.checklist.filter(item => item.isDone).length;
    return (done / task.checklist.length) * 100;
  }

  getChecklistCount(task: Task): string {
    if (!task.checklist || task.checklist.length === 0) return '';
    const done = task.checklist.filter(item => item.isDone).length;
    return `${done}/${task.checklist.length}`;
  }

  getPriorityClass(priority: TaskPriority): string {
    return `priority-${priority}`;
  }

  getAssigneeName(task: Task): string {
    return task.assignedTo?.name || task.assignedToName || '';
  }

  getAssigneeInitial(task: Task): string {
    const name = this.getAssigneeName(task);
    return name ? name.charAt(0).toUpperCase() : '';
  }

  isOverdue(task: Task): boolean {
    if (!task.dueDate || task.status === 'done') return false;
    return new Date(task.dueDate) < new Date();
  }

  formatDueDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getNextStatuses(currentStatus: TaskStatus): { status: TaskStatus; label: string }[] {
    const transitions: Record<TaskStatus, { status: TaskStatus; label: string }[]> = {
      todo: [{ status: 'in_progress', label: 'Start' }],
      in_progress: [{ status: 'review', label: 'Review' }, { status: 'todo', label: 'Back' }],
      review: [{ status: 'done', label: 'Done' }, { status: 'in_progress', label: 'Back' }],
      done: [{ status: 'todo', label: 'Reopen' }]
    };
    return transitions[currentStatus] || [];
  }

  private updateStats(): void {
    this.stats = {
      todo: this.columns[0].tasks.length,
      in_progress: this.columns[1].tasks.length,
      review: this.columns[2].tasks.length,
      done: this.columns[3].tasks.length
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
