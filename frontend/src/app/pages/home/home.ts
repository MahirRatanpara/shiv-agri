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

interface CarouselSlide {
  id: string;
  title: string;
  image: string;
  darkText: boolean;
}

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  projects: Project[] = [];
  carouselSlides: CarouselSlide[] = [];
  selectedProject: Project | null = null;
  selectedProjectIndex: number = -1;
  isPopupOpen: boolean = false;
  miniPhotos: string[] = [];
  showScrollButton: boolean = false;
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
  private isCarouselNavigating: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadCarouselSlides();
    this.loadProjects();
    this.loadMiniPhotos();
    this.setupScrollListener();
  }

  loadCarouselSlides(): void {
    this.http.get<CarouselSlide[]>('assets/data/carousel-slides.json').subscribe({
      next: (slides) => {

        this.carouselSlides = slides;
        // Reinitialize carousel after slides are loaded
        setTimeout(() => {
          this.initializeOwlCarousel();
        }, 100);
      },
      error: (error) => {

        this.carouselSlides = [];
      }
    });
  }

  loadProjects(): void {
    this.http.get<Project[]>('assets/data/projects.json').subscribe({
      next: (projects) => {

        // Filter out invalid projects (must have at least a title or id)
        this.projects = projects.filter(project =>
          project && (project.title || project.id)
        );

      },
      error: (error) => {

        // Initialize with empty array on error
        this.projects = [];
      }
    });
  }

  loadMiniPhotos(): void {
    this.http.get<string[]>('assets/data/mini-photos.json').subscribe({
      next: (photos) => {

        this.miniPhotos = photos;
      },
      error: (error) => {

        this.miniPhotos = [];
      }
    });
  }

  ngAfterViewInit(): void {
    this.initializeOwlCarousel();
  }

  ngOnDestroy(): void {
    // Remove keyboard event listener
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Remove scroll event listener
    window.removeEventListener('scroll', this.handleScroll);

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
      const carousel = $('#home-slider').owlCarousel({
        loop: true,
        margin: 0,
        nav: true,
        dots: true,
        items: 1,
        autoplay: false,
        autoplayTimeout: 5000,
        autoplayHoverPause: true,
        smartSpeed: 1000,
        dotsSpeed: 400,
        dotsEach: false
      });

      // Function to update dot states based on current slide
      const updateDotStates = (currentPage: number) => {
        const $dots = $('#home-slider .owl-dot');
        const totalDots = $dots.length;

        $dots.each((index: number, element: any) => {
          const $dot = $(element);

          // Check if this dot is a neighbor (previous, current, or next)
          const isPrevious = index === (currentPage - 1 + totalDots) % totalDots;
          const isCurrent = index === currentPage;
          const isNext = index === (currentPage + 1) % totalDots;

          if (isPrevious || isCurrent || isNext) {
            // Enable neighbor dots
            $dot.removeClass('disabled-dot').css('pointer-events', 'auto');
          } else {
            // Disable non-neighbor dots
            $dot.addClass('disabled-dot').css('pointer-events', 'none');
          }
        });
      };

      // Update dot states on slide change
      carousel.on('changed.owl.carousel', function(event: any) {
        // event.page.index gives us the current page/slide index
        const currentPage = event.page.index;
        updateDotStates(currentPage);
      });

      // Initial update after carousel is ready
      carousel.on('initialized.owl.carousel', function(event: any) {
        const currentPage = event.page.index;
        updateDotStates(currentPage);
      });

      // Fallback initial update
      setTimeout(() => {
        updateDotStates(0);
      }, 500);

      // Add keyboard navigation
      this.keyboardHandler = (event: KeyboardEvent) => {
        // Only handle arrow keys when popup is not open and not already navigating
        if (!this.isPopupOpen && !this.isCarouselNavigating) {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.isCarouselNavigating = true;
            // Simply click the prev button
            $('#home-slider .owl-prev').trigger('click');
            // Reset flag after animation completes
            setTimeout(() => {
              this.isCarouselNavigating = false;
            }, 1100);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.isCarouselNavigating = true;
            // Simply click the next button
            $('#home-slider .owl-next').trigger('click');
            // Reset flag after animation completes
            setTimeout(() => {
              this.isCarouselNavigating = false;
            }, 1100);
          }
        }
      };

      // Add event listener
      document.addEventListener('keydown', this.keyboardHandler);
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

  scrollToServices(event: Event): void {
    event.preventDefault();
    const servicesSection = document.getElementById('services');
    if (servicesSection) {
      servicesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  setupScrollListener(): void {
    window.addEventListener('scroll', this.handleScroll);
  }

  handleScroll = (): void => {
    // Show button when scrolled down more than 300px
    this.showScrollButton = window.pageYOffset > 300;
  }

}
