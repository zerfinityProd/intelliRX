import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingComponent {
  constructor(private router: Router) {}

  selectPlan(plan: string) {
    this.router.navigate(['/register'], { queryParams: { plan } });
  }
}
