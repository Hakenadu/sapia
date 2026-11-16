import { inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { SapiaService } from './core/sapia.service';
import { WorkspaceService } from './core/workspace.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Config and plugins have to be ready before the first component renders.
    provideAppInitializer(async () => {
      const sapia = inject(SapiaService);
      const workspace = inject(WorkspaceService);
      await sapia.initialise();
      await workspace.start();
    }),
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { autoFocus: 'dialog', restoreFocus: true, maxWidth: '94vw', hasBackdrop: true } },
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 3200, horizontalPosition: 'center', verticalPosition: 'bottom' } },
    { provide: MAT_TOOLTIP_DEFAULT_OPTIONS, useValue: { showDelay: 450, hideDelay: 0, touchendHideDelay: 0, disableTooltipInteractivity: true } },
  ],
};
