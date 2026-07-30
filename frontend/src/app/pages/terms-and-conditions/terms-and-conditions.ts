import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms-and-conditions',
  imports: [RouterLink],
  templateUrl: './terms-and-conditions.html',
  styleUrl: './terms-and-conditions.css',
})
export class TermsAndConditionsComponent {
  readonly lastUpdated = 'July 30, 2026';
}
