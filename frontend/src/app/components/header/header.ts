import { Component, AfterViewInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

declare var $: any;

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements AfterViewInit {

  ngAfterViewInit(): void {
    // Manual toggle for mobile menu
    setTimeout(() => {
      const toggler = document.querySelector('.navbar-toggler') as HTMLElement;
      const menu = document.querySelector('#navbarSupportedContent') as HTMLElement;

      if (toggler && menu) {
        // Prevent default behavior and ensure toggle works
        toggler.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const isExpanded = toggler.getAttribute('aria-expanded') === 'true';
          toggler.setAttribute('aria-expanded', (!isExpanded).toString());
          menu.classList.toggle('show');

          console.log('Mobile menu toggled:', menu.classList.contains('show'));
        });

        // Close menu when clicking on nav links
        const navLinks = menu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
          link.addEventListener('click', () => {
            menu.classList.remove('show');
            toggler.setAttribute('aria-expanded', 'false');
          });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (!menu.contains(target) && !toggler.contains(target)) {
            menu.classList.remove('show');
            toggler.setAttribute('aria-expanded', 'false');
          }
        });
      } else {
        console.error('Toggler or menu not found');
      }
    }, 100);
  }

}
