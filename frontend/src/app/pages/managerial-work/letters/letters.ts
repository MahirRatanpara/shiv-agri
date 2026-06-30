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

        if (
          element.tagName === 'DIV' &&
          element.classList.contains('page-break')
        ) {
          text += '[PAGEBREAK]\n';
        } else if (element.tagName === 'TABLE') {
          // Convert each row back to a Markdown-style pipe line.
          const rows = element.querySelectorAll('tr');
          rows.forEach(tr => {
            const cells = Array.from(tr.children).map(
              cell => cell.textContent?.trim() || ''
            );
            text += `| ${cells.join(' | ')} |\n`;
          });
        } else if (element.tagName === 'OL') {
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
          // Preserve bold runs as **markers** so they round-trip on edit.
          let inner = (element as HTMLElement).innerHTML || '';
          inner = inner
            .replace(/<\s*strong\s*>/gi, '**')
            .replace(/<\s*\/\s*strong\s*>/gi, '**');
          const tmp = document.createElement('div');
          tmp.innerHTML = inner;
          const pText = (tmp.textContent || '').trim();
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

  loadAnalysisQuotationTemplate(lang: 'english' | 'gujarati'): void {
    this.managerialService.getAnalysisQuotationTemplate(lang).subscribe({
      next: (response) => {
        const template = response.template || '';
        const existing = this.currentLetter.content || '';
        // Append to any existing content, mirroring the service-list behaviour.
        this.currentLetter.content = existing
          ? `${existing}\n\n${template}`
          : template;
      },
      error: (error) => {
        console.error('Error loading analysis quotation template:', error);
        this.toastService.error('Failed to load analysis quotation template');
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
    let inTable = false;
    let tableRows: string[] = [];

    const flushList = () => {
      if (inList) {
        html += `<ol>${listItems.join('')}</ol>`;
        inList = false;
        listItems = [];
      }
    };

    const flushTable = () => {
      if (inTable) {
        html += this.buildTableHtml(tableRows);
        inTable = false;
        tableRows = [];
      }
    };

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // Page break marker — forces the following content onto a new PDF page.
      if (trimmedLine.toUpperCase() === '[PAGEBREAK]') {
        flushList();
        flushTable();
        html += '<div class="page-break"></div>';
        return;
      }

      // Table row (Markdown-style pipe-delimited, e.g. "| a | b | c |")
      if (trimmedLine.startsWith('|') && trimmedLine.length > 1) {
        flushList();
        inTable = true;
        tableRows.push(trimmedLine);
        return;
      }

      // Any non-table line ends the current table
      flushTable();

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
        flushList();

        // Add as paragraph if not empty
        if (trimmedLine) {
          html += this.formatParagraph(trimmedLine);
        }
      }
    });

    // Close any open list/table
    flushList();
    flushTable();

    return html;
  }

  // Convert a single text line into a paragraph. Inline **bold** markers
  // become <strong>; a line that is entirely bold becomes a centered,
  // heading-style paragraph (used for the letter subject).
  private formatParagraph(line: string): string {
    const wholeBold =
      line.startsWith('**') &&
      line.endsWith('**') &&
      line.length > 4 &&
      line.slice(2, -2).indexOf('**') === -1;

    if (wholeBold) {
      return `<p class="center"><strong>${line.slice(2, -2).trim()}</strong></p>`;
    }

    const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return `<p>${formatted}</p>`;
  }

  // Parse a Markdown-style pipe row into trimmed cell values.
  private parsePipeRow(row: string): string[] {
    let r = row.trim();
    if (r.startsWith('|')) r = r.slice(1);
    if (r.endsWith('|')) r = r.slice(0, -1);
    return r.split('|').map(c => c.trim());
  }

  // Build an HTML table from collected pipe-delimited rows.
  // The first non-separator row becomes the header.
  private buildTableHtml(rows: string[]): string {
    const isSeparator = (cells: string[]): boolean =>
      cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));

    let headerHtml = '';
    let bodyHtml = '';
    let headerDone = false;

    rows.forEach(row => {
      const cells = this.parsePipeRow(row);
      if (isSeparator(cells)) {
        return;
      }
      if (!headerDone) {
        headerHtml = `<tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr>`;
        headerDone = true;
      } else {
        bodyHtml += `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
      }
    });

    if (!headerDone) return '';

    return `<table class="content-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
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
