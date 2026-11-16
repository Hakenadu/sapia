import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmData {
  title: string;
  text: string;
  /** Buttons from least to most prominent. */
  actions: { id: string; label: string; kind?: 'primary' | 'danger' | 'ghost' }[];
}

@Component({
  selector: 'sapia-confirm-dialog',
  template: `
    <h2>{{ data.title }}</h2>
    <p>{{ data.text }}</p>
    <div class="actions">
      @for (action of data.actions; track action.id) {
        <button class="text-button" [class.primary]="action.kind === 'primary'" [class.danger]="action.kind === 'danger'" [class.ghost]="action.kind === 'ghost'" (click)="ref.close(action.id)">
          {{ action.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 24px 20px;
      max-width: 440px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0;
      color: var(--text-2);
      font-size: 13.5px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 24px;
    }
    .text-button.danger {
      border-color: transparent;
      background: var(--danger);
      color: #fff;
      &:hover {
        filter: brightness(1.08);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, string>>(MatDialogRef);
}
