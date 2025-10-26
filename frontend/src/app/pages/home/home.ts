import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

declare var $: any;

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    // Initialize Owl Carousel after view is ready
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
      // Destroy existing carousel if it exists
      if ($('#home-slider').data('owl.carousel')) {
        $('#home-slider').data('owl.carousel').destroy();
      }

      // Remove owl classes that might be left over
      $('#home-slider').removeClass('owl-loaded owl-drag owl-grab');
      $('#home-slider').find('.owl-stage-outer').children().unwrap();

      // Initialize the carousel
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
    }, 100);
  }

}
