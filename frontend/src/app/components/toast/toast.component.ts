import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let toast of toasts$ | async"
        class="toast toast-{{toast.type}}"
      >
        <div class="toast-icon">
          <i class="fas" [ngClass]="{
            'fa-check-circle': toast.type === 'success',
            'fa-exclamation-circle': toast.type === 'error',
            'fa-info-circle': toast.type === 'info',
            'fa-exclamation-triangle': toast.type === 'warning'
          }"></i>
        </div>
        <div class="toast-message">{{ toast.message }}</div>
        <button class="toast-close" (click)="closeToast(toast.id)">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 420px;
    }

    .toast {
      display: flex;
      align-items: center;
      padding: 16px 18px;
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      min-width: 320px;
      min-height: 60px;
      color: white;
      font-family: 'Noto Sans Gujarati', 'Shruti', sans-serif;
      font-size: 14px;
      border-left: 4px solid rgba(255, 255, 255, 0.5);
      opacity: 1;
      visibility: visible;
    }

    @keyframes slideIn {
      from {
        transform: translateX(450px) scale(0.9);
        opacity: 0;
      }
      to {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
    }

    .toast-success {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-left-color: #34d399;
    }

    .toast-error {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border-left-color: #f87171;
    }

    .toast-info {
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
      border-left-color: #a78bfa;
    }

    .toast-warning {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      border-left-color: #fbbf24;
    }

    .toast-icon {
      font-size: 24px;
      margin-right: 14px;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    }

    .toast-message {
      flex: 1;
      line-height: 1.6;
      font-weight: 500;
      word-wrap: break-word;
      overflow-wrap: break-word;
      min-height: 20px;
      display: flex;
      align-items: center;
    }

    .toast-close {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      padding: 6px;
      margin-left: 12px;
      opacity: 0.9;
      transition: all 0.2s;
      flex-shrink: 0;
      border-radius: 6px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toast-close:hover {
      background: rgba(255, 255, 255, 0.3);
      opacity: 1;
      transform: scale(1.1);
    }

    @media (max-width: 768px) {
      .toast-container {
        right: 10px;
        left: 10px;
        max-width: none;
      }

      .toast {
        min-width: auto;
        font-size: 13px;
        padding: 14px 16px;
      }

      .toast-icon {
        font-size: 20px;
        margin-right: 10px;
      }
    }
  `]
})
export class ToastComponent implements OnInit {
  toasts$: Observable<Toast[]>;

  constructor(private toastService: ToastService) {
    this.toasts$ = this.toastService.toasts;
  }

  ngOnInit(): void {}

  closeToast(id: number) {
    this.toastService.remove(id);
  }
}
