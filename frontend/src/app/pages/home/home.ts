import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

declare var $: any;

interface Project {
  id: string;
  title: string;
  category: string;
  image: string;
  shortDescription: string;
  fullDescription: string;
  features: string[];
}

@Component({
  selector: 'app-home',
  imports: [CommonModule],
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
        this.projects = projects;
      },
      error: (error) => {
        console.error('Error loading projects:', error);
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
    this.selectedProjectIndex = this.projects.findIndex(p => p.id === project.id);
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
    if (this.projects.length === 0 || this.selectedProjectIndex === -1) return;

    if (direction === 'prev') {
      this.selectedProjectIndex = (this.selectedProjectIndex - 1 + this.projects.length) % this.projects.length;
    } else {
      this.selectedProjectIndex = (this.selectedProjectIndex + 1) % this.projects.length;
    }

    this.selectedProject = this.projects[this.selectedProjectIndex];
  }

}
