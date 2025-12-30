import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ManagerialWorkService,
  Letter,
  LetterFilters,
} from '../../../services/managerial-work.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmationModalService } from '../../../services/confirmation-modal.service';
import { HasPermissionDirective } from '../../../directives/has-permission.directive';

@Component({
  selector: 'app-letters',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  providers: [ManagerialWorkService],
  templateUrl: './letters.html',
  styleUrls: ['./letters.css'],
})
export class LettersComponent implements OnInit {
  currentView: 'list' | 'form' = 'list';
  isEditing: boolean = false;

  letters: Letter[] = [];
  currentLetter: Partial<Letter> = this.getEmptyLetter();
  allTags: string[] = [];

  filters: LetterFilters = {
    page: 1,
    limit: 20,
    includeDrafts: false,
  };

  totalLetters: number = 0;
  totalPages: number = 0;

  isLoading: boolean = false;
  isSaving: boolean = false;
  searchTerm: string = '';
  showFilters: boolean = false;

  constructor(
    private managerialService: ManagerialWorkService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadLetters();
    this.loadTags();
  }

  getEmptyLetter(): Partial<Letter> {
    return {
      letterNumber: '',
      date: new Date().toISOString().split('T')[0],
      letterType: 'general',
      subject: '',
      recipientName: '',
      recipientAddress: '',
      content: '',
      tags: [],
      isDraft: false,
    };
  }

  loadLetters(): void {
    this.isLoading = true;
    this.managerialService.getLetters(this.filters).subscribe({
      next: (response) => {
        this.letters = response.letters;
        this.totalLetters = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading letters:', error);
        this.toastService.error('Failed to load letters');
        this.isLoading = false;
      },
    });
  }

  loadTags(): void {
    this.managerialService.getAllTags().subscribe({
      next: (response) => {
        this.allTags = response.tags;
      },
      error: (error) => {
        console.error('Error loading tags:', error);
      },
    });
  }

  applySearch(): void {
    this.filters.search = this.searchTerm;
    this.filters.page = 1;
    this.loadLetters();
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadLetters();
  }

  clearFilters(): void {
    this.filters = { page: 1, limit: 20, includeDrafts: false };
    this.searchTerm = '';
    this.loadLetters();
  }

  toggleDrafts(): void {
    this.filters.includeDrafts = !this.filters.includeDrafts;
    this.applyFilters();
  }

  changePage(page: number): void {
    this.filters.page = page;
    this.loadLetters();
  }

  showCreateForm(): void {
    this.isEditing = false;
    this.currentLetter = this.getEmptyLetter();

    this.managerialService.getNextLetterNumber().subscribe({
      next: (response) => {
        this.currentLetter.letterNumber = response.letterNumber;
        this.currentView = 'form';
      },
      error: (error) => {
        console.error('Error getting letter number:', error);
        this.toastService.error('Failed to generate letter number');
      },
    });
  }

  editLetter(letter: Letter): void {
    this.isEditing = true;
    this.currentLetter = { ...letter, tags: [...(letter.tags || [])] };

    // Convert HTML back to plain text for editing
    if (this.currentLetter.content) {
      this.currentLetter.content = this.convertHtmlToText(this.currentLetter.content);
    }

    this.currentView = 'form';
  }

  private convertHtmlToText(html: string): string {
    if (!html) return '';

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    let text = '';
    let listCounter = 1;

    // Process all nodes
    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const content = node.textContent?.trim();
        if (content) {
          text += content;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        if (element.tagName === 'OL') {
          listCounter = 1;
          Array.from(element.children).forEach(child => {
            if (child.tagName === 'LI') {
              const liText = child.textContent?.trim();
              if (liText) {
                text += `${listCounter}. ${liText}\n`;
                listCounter++;
              }
            }
          });
        } else if (element.tagName === 'P') {
          const pText = element.textContent?.trim();
          if (pText) {
            text += `${pText}\n`;
          }
        } else if (element.tagName === 'BR') {
          text += '\n';
        } else {
          // Process children
          Array.from(element.childNodes).forEach(processNode);
        }
      }
    };

    Array.from(tempDiv.childNodes).forEach(processNode);

    return text.trim();
  }

  cancelForm(): void {
    this.currentView = 'list';
    this.currentLetter = this.getEmptyLetter();
  }

  loadServiceListTemplate(): void {
    this.managerialService.getServiceListTemplate().subscribe({
      next: (response) => {
        // Convert HTML template to plain text with numbers for textarea
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = response.template;

        // Extract list items and format with numbers
        const listItems = tempDiv.querySelectorAll('li');
        let formattedContent = '';

        listItems.forEach((item, index) => {
          const text = item.textContent || item.innerText || '';
          formattedContent += `${index + 1}. ${text}\n`;
        });

        this.currentLetter.content += formattedContent.trim();
      },
      error: (error) => {
        console.error('Error loading template:', error);
        this.toastService.error('Failed to load service list template');
      },
    });
  }

  // Simple formatting functions for contenteditable
  execCommand(command: string, value: string = ''): void {
    document.execCommand(command, false, value);
  }

  insertList(ordered: boolean): void {
    this.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
  }

  onTagsInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.currentLetter.tags = value
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  saveLetter(asDraft: boolean = false): void {
    if (!this.validateLetter()) {
      return;
    }

    this.currentLetter.isDraft = asDraft;

    // Convert plain text to HTML with proper formatting
    this.currentLetter.content = this.convertTextToHtml(this.currentLetter.content || '');

    this.isSaving = true;

    const saveOperation = this.isEditing
      ? this.managerialService.updateLetter(
          this.currentLetter.id!,
          this.currentLetter
        )
      : this.managerialService.createLetter(this.currentLetter);

    saveOperation.subscribe({
      next: (response) => {
        this.toastService.success(
          `Letter ${asDraft ? 'saved as draft' : this.isEditing ? 'updated' : 'created'} successfully`
        );
        this.isSaving = false;
        this.currentView = 'list';
        this.loadLetters();
        this.loadTags(); // Reload tags in case new ones were added

        // Auto-download PDF if not a draft
        if (!asDraft && response.id) {
          this.generatePDF(response);
        }
      },
      error: (error) => {
        console.error('Error saving letter:', error);
        this.toastService.error('Failed to save letter');
        this.isSaving = false;
      },
    });
  }

  private convertTextToHtml(text: string): string {
    if (!text) return '';

    // Split by lines
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let listItems: string[] = [];

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // Check if line is a numbered list item (e.g., "1. ", "2. ", etc.)
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);

      if (numberedMatch) {
        // This is a numbered list item
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push(`<li>${numberedMatch[2]}</li>`);
      } else {
        // Not a list item
        if (inList) {
          // Close the previous list
          html += `<ol>${listItems.join('')}</ol>`;
          inList = false;
          listItems = [];
        }

        // Add as paragraph if not empty
        if (trimmedLine) {
          html += `<p>${trimmedLine}</p>`;
        }
      }
    });

    // Close list if still open
    if (inList) {
      html += `<ol>${listItems.join('')}</ol>`;
    }

    return html;
  }

  validateLetter(): boolean {
    if (!this.currentLetter.content?.trim()) {
      this.toastService.error('Letter content is required');
      return false;
    }

    return true;
  }

  async deleteLetter(letter: Letter): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete Letter',
      message: `Are you sure you want to delete this letter?`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash'
    });

    if (confirmed) {
      this.managerialService.deleteLetter(letter.id!).subscribe({
        next: () => {
          this.toastService.success('Letter deleted successfully');
          this.loadLetters();
        },
        error: (error) => {
          console.error('Error deleting letter:', error);
          this.toastService.error('Failed to delete letter');
        },
      });
    }
  }

  generatePDF(letter: Letter): void {
    this.managerialService.generateLetterPDF(letter.id!).subscribe({
      next: (blob) => {
        const filename = `Letter_${letter.letterNumber || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;
        this.managerialService.downloadFile(blob, filename);
        this.toastService.success('PDF generated successfully');
      },
      error: (error) => {
        console.error('Error generating PDF:', error);
        this.toastService.error('Failed to generate PDF');
      },
    });
  }

  formatDate(date: any): string {
    return new Date(date).toLocaleDateString('en-IN');
  }

  getLetterTypeLabel(type: string): string {
    const labels: any = {
      service_list: 'Service List',
      general: 'General',
      custom: 'Custom',
    };
    return labels[type] || type;
  }
}
