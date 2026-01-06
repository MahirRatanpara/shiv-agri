import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { EventsComponent } from './pages/events/events';
import { EventDetailsComponent } from './pages/event-details/event-details';
import { CausesComponent } from './pages/causes/causes';
import { CausesDetailsComponent } from './pages/causes-details/causes-details';
import { BlogComponent } from './pages/blog/blog';
import { BlogDetailsComponent } from './pages/blog-details/blog-details';
import { ProjectDetailsComponent } from './pages/project-details/project-details';
import { ProjectWizardComponent } from './pages/project-wizard/project-wizard';
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
import { LabTestingComponent } from './pages/lab-testing/lab-testing';
import { UserManagementComponent } from './pages/admin/user-management/user-management.component';
import { ManagerialWorkComponent } from './pages/managerial-work/managerial-work';
import { ReceiptsComponent } from './pages/managerial-work/receipts/receipts';
import { InvoicesComponent } from './pages/managerial-work/invoices/invoices';
import { LettersComponent } from './pages/managerial-work/letters/letters';
import { FarmDashboardComponent } from './pages/farm-dashboard/farm-dashboard';
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
  { path: 'projects/new', component: ProjectWizardComponent, canActivate: [authGuard] },
  { path: 'projects/edit/:id', component: ProjectWizardComponent, canActivate: [authGuard] },
  { path: 'project-details/:id', component: ProjectDetailsComponent },
  { path: 'shop', component: ShopComponent },
  { path: 'shop-details/:id', component: ShopDetailsComponent },
  { path: 'team', component: TeamComponent },
  { path: 'team-details/:id', component: TeamDetailsComponent },
  { path: 'gallery', component: GalleryComponent },
  { path: 'testimonials', component: TestimonialsComponent },
  { path: 'donation', component: DonationComponent },
  {
    path: 'lab-testing',
    component: LabTestingComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'soil-testing', pathMatch: 'full' },
      { path: 'soil-testing', component: SoilTestingComponent },
      { path: 'water-testing', component: WaterTestingComponent },
      // TODO: Add fertilizer-testing route when implemented
      // { path: 'fertilizer-testing', component: FertilizerTestingComponent },
    ],
  },
  {
    path: 'managerial-work',
    component: ManagerialWorkComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'receipts', pathMatch: 'full' },
      { path: 'receipts', component: ReceiptsComponent },
      { path: 'invoices', component: InvoicesComponent },
      { path: 'letters', component: LettersComponent },
    ],
  },
  { path: 'farm-dashboard', component: FarmDashboardComponent, canActivate: [authGuard] },
  { path: 'admin/users', component: UserManagementComponent, canActivate: [authGuard] },
  { path: 'my-account', component: MyAccountComponent, canActivate: [authGuard] },
  { path: 'contact', component: ContactComponent },
  { path: '404', component: NotFoundComponent },
  { path: '**', redirectTo: '/404' }
];
