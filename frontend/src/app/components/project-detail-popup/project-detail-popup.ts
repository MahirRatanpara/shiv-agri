import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ProjectImage {
  url: string;
  caption?: string;
}

export interface ProjectDetail {
  title: string;
  description: string;
  images?: ProjectImage[];
  paragraphs?: string[];
  detailedContent?: string;
}

@Component({
  selector: 'app-project-detail-popup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-detail-popup.html',
  styleUrls: ['./project-detail-popup.css']
})
export class ProjectDetailPopupComponent {
  @Input() project: ProjectDetail | null = null;
  @Input() isOpen: boolean = false;
  @Output() closePopup = new EventEmitter<void>();

  onClose(): void {
    this.closePopup.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    // Close when clicking on the backdrop (not the modal content)
    if ((event.target as HTMLElement).classList.contains('popup-backdrop')) {
      this.onClose();
    }
  }

  stopPropagation(event: MouseEvent): void {
    // Prevent clicks inside the modal from closing it
    event.stopPropagation();
  }
}
