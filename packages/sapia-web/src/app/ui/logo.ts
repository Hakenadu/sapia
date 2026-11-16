import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/** The Sapia mark: a small bear on the brand gradient. */
@Component({
  selector: 'sapia-logo',
  template: `
    <svg viewBox="0 0 48 48" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="id" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8b7cf6" />
          <stop offset=".5" stop-color="#6d8dfa" />
          <stop offset="1" stop-color="#4fd1c5" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" [attr.fill]="fill" />
      <circle cx="13.5" cy="15.5" r="6.6" fill="#fff" />
      <circle cx="34.5" cy="15.5" r="6.6" fill="#fff" />
      <circle cx="13.5" cy="15.5" r="3.2" fill="#c9c1ff" />
      <circle cx="34.5" cy="15.5" r="3.2" fill="#c9c1ff" />
      <ellipse cx="24" cy="27" rx="15.2" ry="13.6" fill="#fff" />
      <ellipse cx="24" cy="31.6" rx="6.4" ry="5" fill="#e9e5ff" />
      <circle cx="14.8" cy="30.6" r="2.5" fill="#ff9fc0" opacity=".55" />
      <circle cx="33.2" cy="30.6" r="2.5" fill="#ff9fc0" opacity=".55" />
      <circle cx="18.2" cy="25.4" r="2.1" fill="#2a2550" />
      <circle cx="29.8" cy="25.4" r="2.1" fill="#2a2550" />
      <circle cx="18.9" cy="24.7" r=".7" fill="#fff" />
      <circle cx="30.5" cy="24.7" r=".7" fill="#fff" />
      <ellipse cx="24" cy="29.5" rx="2.4" ry="1.7" fill="#2a2550" />
      <path d="M21.500 32.7c.8 1.1 1.900 1.1 2.500 0 .6 1.1 1.700 1.1 2.500 0" fill="none" stroke="#2a2550" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    svg {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  readonly size = input(30);
  // Gradient ids must be unique per instance within the document.
  protected readonly id = `sapia-logo-${nextId++}`;
  protected readonly fill = `url(#${this.id})`;
}
