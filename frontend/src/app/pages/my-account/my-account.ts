import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-account.html',
  styleUrl: './my-account.css',
})
export class MyAccountComponent implements OnInit {
  user: User | null = null;
  isLoading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
    });
  }

  logout(): void {
    if (confirm('Are you sure you want to logout?')) {
      this.isLoading = true;
      this.authService.logout().subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/login']);
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Logout error:', error);
          // Still redirect to login even if API call fails
          this.router.navigate(['/login']);
        }
      });
    }
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'badge-admin';
      case 'assistant':
        return 'badge-assistant';
      default:
        return 'badge-user';
    }
  }
}
