import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ConfirmationConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmationModalService {
  private showModalSubject = new BehaviorSubject<boolean>(false);
  private configSubject = new BehaviorSubject<ConfirmationConfig | null>(null);
  private resolveCallback: ((value: boolean) => void) | null = null;

  showModal$ = this.showModalSubject.asObservable();
  config$ = this.configSubject.asObservable();

  confirm(config: ConfirmationConfig): Promise<boolean> {
    const fullConfig: ConfirmationConfig = {
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-exclamation-triangle',
      ...config
    };

    this.configSubject.next(fullConfig);
    this.showModalSubject.next(true);

    return new Promise<boolean>((resolve) => {
      this.resolveCallback = resolve;
    });
  }

  confirmAction(confirmed: boolean): void {
    this.showModalSubject.next(false);
    if (this.resolveCallback) {
      this.resolveCallback(confirmed);
      this.resolveCallback = null;
    }
  }

  close(): void {
    this.confirmAction(false);
  }
}
