import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'lorne-admin-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <p-toast position="bottom-right" />
  `
})
export class AppComponent {}
