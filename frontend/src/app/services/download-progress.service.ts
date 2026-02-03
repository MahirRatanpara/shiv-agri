import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface DownloadProgress {
  isActive: boolean;
  title: string;
  current: number;
  total: number;
  currentFileName: string;
  isCompleted: boolean;
  hasError: boolean;
  errorMessage: string;
}

const initialState: DownloadProgress = {
  isActive: false,
  title: 'Downloading Reports',
  current: 0,
  total: 0,
  currentFileName: '',
  isCompleted: false,
  hasError: false,
  errorMessage: ''
};

@Injectable({
  providedIn: 'root'
})
export class DownloadProgressService {
  private progressSubject = new BehaviorSubject<DownloadProgress>(initialState);
  progress$: Observable<DownloadProgress> = this.progressSubject.asObservable();

  /**
   * Start a new download progress tracking session
   */
  start(title: string, total: number): void {
    this.progressSubject.next({
      isActive: true,
      title,
      current: 0,
      total,
      currentFileName: '',
      isCompleted: false,
      hasError: false,
      errorMessage: ''
    });
  }

  /**
   * Update progress with current file info
   */
  update(current: number, fileName: string): void {
    const currentState = this.progressSubject.value;
    this.progressSubject.next({
      ...currentState,
      current,
      currentFileName: fileName,
      isCompleted: false
    });
  }

  /**
   * Mark download as completed successfully
   */
  complete(): void {
    const currentState = this.progressSubject.value;
    this.progressSubject.next({
      ...currentState,
      current: currentState.total,
      currentFileName: '',
      isCompleted: true,
      hasError: false
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.progressSubject.value.isCompleted) {
        this.reset();
      }
    }, 5000);
  }

  /**
   * Mark download as failed with error message
   */
  error(message: string): void {
    const currentState = this.progressSubject.value;
    this.progressSubject.next({
      ...currentState,
      isCompleted: false,
      hasError: true,
      errorMessage: message
    });
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.progressSubject.next(initialState);
  }

  /**
   * Get current progress value
   */
  getCurrentProgress(): DownloadProgress {
    return this.progressSubject.value;
  }
}
