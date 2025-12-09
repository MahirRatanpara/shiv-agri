import { Component, AfterViewInit, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import { AuthService, User } from '../../services/auth.service';

declare var $: any;

@Component({
  selector: 'app-header',
  imports: [RouterLink, CommonModule, NgOptimizedImage],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements AfterViewInit, OnInit {
  currentUser: User | null = null;
  isAuthenticated = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Subscribe to current user changes
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.isAuthenticated = !!user;
    });
  }

  logout(): void {
    if (confirm('Are you sure you want to logout?')) {
      this.authService.logout().subscribe({
        next: () => {
          this.router.navigate(['/login']);
        },
        error: (error) => {
          console.error('Logout error:', error);
          this.router.navigate(['/login']);
        }
      });
    }
  }

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
