import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { MediaService } from '../../services/media.service';

interface MediaItem {
  _id: string;
  projectId: string;
  category: string;
  filename: string;
  mimeType: string;
  url?: string;
  createdAt: string;
}

@Component({
  selector: 'app-media-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './media-gallery.html',
  styleUrl: './media-gallery.css'
})
export class MediaGalleryComponent implements OnInit, OnDestroy {
  @Input() projectId: string = '';

  private destroy$ = new Subject<void>();

  mediaItems: MediaItem[] = [];
  filteredItems: MediaItem[] = [];
  loading = false;
  uploading = false;
  dragOver = false;

  categories = ['All', 'Site Photos', 'Soil Tests', 'Crop Progress', 'Documents', 'Other'];
  selectedCategory = 'All';
  uploadCategory = 'general';

  lightboxOpen = false;
  lightboxIndex = 0;

  ngOnInit(): void {
    this.loadMedia();
  }

  constructor(private mediaService: MediaService) {}

  loadMedia(): void {
    if (!this.projectId) return;
    this.loading = true;
    this.mediaService.getByProject(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.mediaItems = (res.data || res || []).map((item: MediaItem) => ({
            ...item,
            url: this.mediaService.getUrl(item._id)
          }));
          this.filterItems();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });
  }

  filterItems(): void {
    if (this.selectedCategory === 'All') {
      this.filteredItems = [...this.mediaItems];
    } else {
      const cat = this.selectedCategory.toLowerCase().replace(/\s+/g, '_');
      this.filteredItems = this.mediaItems.filter(item => item.category === cat);
    }
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.filterItems();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFile(input.files[0]);
    }
  }

  uploadFile(file: File): void {
    this.uploading = true;
    this.mediaService.upload(file, this.projectId, this.uploadCategory)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.uploading = false;
          this.loadMedia();
        },
        error: () => {
          this.uploading = false;
        }
      });
  }

  deleteMedia(mediaId: string, event: Event): void {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this media?')) return;
    this.mediaService.delete(mediaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.mediaItems = this.mediaItems.filter(m => m._id !== mediaId);
          this.filterItems();
          if (this.lightboxOpen && this.lightboxIndex >= this.filteredItems.length) {
            this.lightboxIndex = Math.max(0, this.filteredItems.length - 1);
          }
          if (this.filteredItems.length === 0) {
            this.lightboxOpen = false;
          }
        }
      });
  }

  openLightbox(index: number): void {
    this.lightboxIndex = index;
    this.lightboxOpen = true;
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
  }

  prevImage(event: Event): void {
    event.stopPropagation();
    this.lightboxIndex = this.lightboxIndex > 0 ? this.lightboxIndex - 1 : this.filteredItems.length - 1;
  }

  nextImage(event: Event): void {
    event.stopPropagation();
    this.lightboxIndex = this.lightboxIndex < this.filteredItems.length - 1 ? this.lightboxIndex + 1 : 0;
  }

  get currentLightboxItem(): MediaItem | null {
    return this.filteredItems[this.lightboxIndex] || null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
