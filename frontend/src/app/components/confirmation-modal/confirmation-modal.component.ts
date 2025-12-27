import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationModalService, ConfirmationConfig } from '../../services/confirmation-modal.service';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrls: ['./confirmation-modal.component.css']
})
export class ConfirmationModalComponent {
  showModal = false;
  config: ConfirmationConfig | null = null;

  constructor(private confirmationService: ConfirmationModalService) {
    this.confirmationService.showModal$.subscribe(show => {
      this.showModal = show;
    });

    this.confirmationService.config$.subscribe(config => {
      this.config = config;
    });
  }

  confirm(): void {
    this.confirmationService.confirmAction(true);
  }

  cancel(): void {
    this.confirmationService.confirmAction(false);
  }

  closeModal(): void {
    this.confirmationService.close();
  }
}
