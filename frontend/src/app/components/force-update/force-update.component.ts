import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppUpdateService } from '../../services/app-update.service';

/**
 * Full-screen, non-dismissible update gate.
 *
 * Deliberately has no close button, no backdrop-click handler and no Escape
 * binding: when the backend says this build is retired, the only way forward is
 * the update. It sits above everything (including modals and toasts) and the
 * hardware back button cannot get behind it because it covers the whole viewport
 * and the app's own back handler is never reached.
 *
 * It renders nothing at all until `blockingUpdate` is set, so it costs nothing on
 * web or on an up-to-date build.
 */
@Component({
  selector: 'app-force-update',
  imports: [CommonModule],
  templateUrl: './force-update.component.html',
  styleUrl: './force-update.component.css'
})
export class ForceUpdateComponent {
  private updates = inject(AppUpdateService);

  readonly info = this.updates.blockingUpdate;

  readonly defaultMessage =
    'A required update is available. Please update to the latest version to continue using Shiv Agri.';

  onUpdate(): void {
    this.updates.openUpdate();
  }
}
