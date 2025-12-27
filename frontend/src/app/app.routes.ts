import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { EventsComponent } from './pages/events/events';
import { EventDetailsComponent } from './pages/event-details/event-details';
import { CausesComponent } from './pages/causes/causes';
import { CausesDetailsComponent } from './pages/causes-details/causes-details';
import { BlogComponent } from './pages/blog/blog';
import { BlogDetailsComponent } from './pages/blog-details/blog-details';
import { ProjectsComponent } from './pages/projects/projects';
import { ProjectDetailsComponent } from './pages/project-details/project-details';
import { ShopComponent } from './pages/shop/shop';
import { ShopDetailsComponent } from './pages/shop-details/shop-details';
import { TeamComponent } from './pages/team/team';
import { TeamDetailsComponent } from './pages/team-details/team-details';
import { GalleryComponent } from './pages/gallery/gallery';
import { TestimonialsComponent } from './pages/testimonials/testimonials';
import { DonationComponent } from './pages/donation/donation';
import { MyAccountComponent } from './pages/my-account/my-account';
import { ContactComponent } from './pages/contact/contact';
import { NotFoundComponent } from './pages/not-found/not-found';
import { LoginComponent } from './pages/login/login';
import { SoilTestingComponent } from './pages/soil-testing/soil-testing';
import { WaterTestingComponent } from './pages/water-testing/water-testing';
import { UserManagementComponent } from './pages/admin/user-management/user-management.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'about', redirectTo: '/contact', pathMatch: 'full' },
  { path: 'events', component: EventsComponent },
  { path: 'event-details/:id', component: EventDetailsComponent },
  { path: 'causes', component: CausesComponent },
  { path: 'causes-details/:id', component: CausesDetailsComponent },
  { path: 'blog', component: BlogComponent },
  { path: 'blog-details/:id', component: BlogDetailsComponent },
  { path: 'projects', component: ProjectsComponent },
  { path: 'project-details/:id', component: ProjectDetailsComponent },
  { path: 'shop', component: ShopComponent },
  { path: 'shop-details/:id', component: ShopDetailsComponent },
  { path: 'team', component: TeamComponent },
  { path: 'team-details/:id', component: TeamDetailsComponent },
  { path: 'gallery', component: GalleryComponent },
  { path: 'testimonials', component: TestimonialsComponent },
  { path: 'donation', component: DonationComponent },
  { path: 'soil-testing', component: SoilTestingComponent, canActivate: [authGuard] },
  { path: 'water-testing', component: WaterTestingComponent, canActivate: [authGuard] },
  { path: 'admin/users', component: UserManagementComponent, canActivate: [authGuard] },
  { path: 'my-account', component: MyAccountComponent, canActivate: [authGuard] },
  { path: 'contact', component: ContactComponent },
  { path: '404', component: NotFoundComponent },
  { path: '**', redirectTo: '/404' }
];
