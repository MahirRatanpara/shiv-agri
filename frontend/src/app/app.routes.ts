import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { EventsComponent } from './pages/events/events';
import { EventDetailsComponent } from './pages/event-details/event-details';
import { CausesComponent } from './pages/causes/causes';
import { CausesDetailsComponent } from './pages/causes-details/causes-details';
import { BlogComponent } from './pages/blog/blog';
import { BlogDetailsComponent } from './pages/blog-details/blog-details';
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
import { FertilizerTestingComponent } from './pages/fertilizer-testing/fertilizer-testing';
import { LabTestingComponent } from './pages/lab-testing/lab-testing';
import { UserManagementComponent } from './pages/admin/user-management/user-management.component';
import { ManagerialWorkComponent } from './pages/managerial-work/managerial-work';
import { ReceiptsComponent } from './pages/managerial-work/receipts/receipts';
import { InvoicesComponent } from './pages/managerial-work/invoices/invoices';
import { LettersComponent } from './pages/managerial-work/letters/letters';
import { FarmManagementComponent } from './pages/farm-management/farm-management';
import { FarmProjectDetailsComponent } from './pages/farm-project-details/farm-project-details';
import { FarmRegistrationPageComponent } from './pages/farm-registration/farm-registration';
import { CompleteProfileComponent } from './pages/complete-profile/complete-profile';
import { authGuard } from './guards/auth.guard';
import { profileCompleteGuard } from './guards/profile-complete.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'complete-profile', component: CompleteProfileComponent, canActivate: [authGuard] },
  { path: 'about', redirectTo: '/contact', pathMatch: 'full' },
  { path: 'events', component: EventsComponent },
  { path: 'event-details/:id', component: EventDetailsComponent },
  { path: 'causes', component: CausesComponent },
  { path: 'causes-details/:id', component: CausesDetailsComponent },
  { path: 'blog', component: BlogComponent },
  { path: 'blog-details/:id', component: BlogDetailsComponent },
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
    canActivate: [authGuard, profileCompleteGuard],
    children: [
      { path: '', redirectTo: 'soil-testing', pathMatch: 'full' },
      { path: 'soil-testing', component: SoilTestingComponent },
      { path: 'soil-testing/session/:sessionId', component: SoilTestingComponent },
      { path: 'fertilizer-testing', component: FertilizerTestingComponent },
      { path: 'fertilizer-testing/session/:sessionId', component: FertilizerTestingComponent },
      { path: 'water-testing', component: WaterTestingComponent },
      { path: 'water-testing/session/:sessionId', component: WaterTestingComponent },
    ],
  },
  {
    path: 'managerial-work',
    component: ManagerialWorkComponent,
    canActivate: [authGuard, profileCompleteGuard],
    children: [
      { path: '', redirectTo: 'receipts', pathMatch: 'full' },
      { path: 'receipts', component: ReceiptsComponent },
      { path: 'invoices', component: InvoicesComponent },
      { path: 'letters', component: LettersComponent },
    ],
  },
  { path: 'farm-management', component: FarmManagementComponent, canActivate: [authGuard, profileCompleteGuard] },
  { path: 'farm-management/new', component: FarmRegistrationPageComponent, canActivate: [authGuard, profileCompleteGuard] },
  { path: 'farm-management/project/:id', component: FarmProjectDetailsComponent, canActivate: [authGuard, profileCompleteGuard] },
  { path: 'admin/users', component: UserManagementComponent, canActivate: [authGuard, profileCompleteGuard] },
  { path: 'my-account', component: MyAccountComponent, canActivate: [authGuard, profileCompleteGuard] },
  { path: 'contact', component: ContactComponent },
  { path: '404', component: NotFoundComponent },
  { path: '**', redirectTo: '/404' }
];
