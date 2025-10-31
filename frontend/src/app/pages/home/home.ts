import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

declare var $: any;

interface Project {
  id?: string;
  title?: string;
  category?: string;
  image?: string;
  shortDescription?: string;
  fullDescription?: string;
  features?: string[];
}

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  projects: Project[] = [];
  selectedProject: Project | null = null;
  selectedProjectIndex: number = -1;
  isPopupOpen: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.http.get<Project[]>('assets/data/projects.json').subscribe({
      next: (projects) => {
        console.log('Projects loaded:', projects);
        // Filter out invalid projects (must have at least a title or id)
        this.projects = projects.filter(project =>
          project && (project.title || project.id)
        );
        console.log('Valid projects:', this.projects);
      },
      error: (error) => {
        console.error('Error loading projects:', error);
        // Initialize with empty array on error
        this.projects = [];
      }
    });
  }

  ngAfterViewInit(): void {
    this.initializeOwlCarousel();
  }

  ngOnDestroy(): void {
    // Destroy Owl Carousel when component is destroyed
    if ($('#home-slider').data('owl.carousel')) {
      $('#home-slider').data('owl.carousel').destroy();
    }
  }

  initializeOwlCarousel(): void {
    // Wait a bit for DOM to be fully ready
    setTimeout(() => {
      // Initialize home slider
      if ($('#home-slider').data('owl.carousel')) {
        $('#home-slider').data('owl.carousel').destroy();
      }
      $('#home-slider').removeClass('owl-loaded owl-drag owl-grab');
      $('#home-slider').find('.owl-stage-outer').children().unwrap();
      $('#home-slider').owlCarousel({
        loop: true,
        margin: 0,
        nav: true,
        dots: false,
        items: 1,
        autoplay: false,
        autoplayTimeout: 5000,
        autoplayHoverPause: true,
        smartSpeed: 1000
      });
    }, 200);
  }

  openProject(project: Project): void {
    // Find project index - handle cases where projects don't have IDs
    if (project.id) {
      // If project has an ID, use it for matching
      this.selectedProjectIndex = this.projects.findIndex(p => p.id === project.id);
    } else {
      // If no ID, match by reference or use indexOf
      this.selectedProjectIndex = this.projects.indexOf(project);
    }

    // Fallback: if still not found, try matching by title
    if (this.selectedProjectIndex === -1 && project.title) {
      this.selectedProjectIndex = this.projects.findIndex(p => p.title === project.title);
    }

    // Final fallback: just use the first project
    if (this.selectedProjectIndex === -1 && this.projects.length > 0) {
      this.selectedProjectIndex = 0;
    }

    this.selectedProject = project;
    this.isPopupOpen = true;

    // Prevent body scrolling when popup is open
    document.body.style.overflow = 'hidden';
  }

  closePopup(): void {
    this.isPopupOpen = false;
    this.selectedProject = null;
    this.selectedProjectIndex = -1;
    // Re-enable body scrolling
    document.body.style.overflow = 'auto';
  }

  navigateProject(direction: 'prev' | 'next'): void {
    // Safety checks
    if (this.projects.length === 0) return;
    if (this.selectedProjectIndex === -1) {
      this.selectedProjectIndex = 0; // Reset to first project if invalid
    }

    // Navigate
    if (direction === 'prev') {
      this.selectedProjectIndex = (this.selectedProjectIndex - 1 + this.projects.length) % this.projects.length;
    } else {
      this.selectedProjectIndex = (this.selectedProjectIndex + 1) % this.projects.length;
    }

    // Update selected project with boundary check
    if (this.selectedProjectIndex >= 0 && this.selectedProjectIndex < this.projects.length) {
      this.selectedProject = this.projects[this.selectedProjectIndex];
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
