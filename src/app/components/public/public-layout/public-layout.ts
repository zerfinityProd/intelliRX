import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.css'
})
export class PublicLayoutComponent {
  constructor(private router: Router) {}

  goToOwnerLogin() {
    this.router.navigate(['/login']);
  }

  goToAppLogin() {
    this.router.navigate(['/app/login']);
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}
