import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Marca de FlexPos: cuadrado azul con gradiente y una "F". */
@Component({
  selector: 'app-logo-flexpos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="tamano()" [attr.height]="tamano()" viewBox="0 0 64 64" role="img" aria-label="FlexPos">
      <defs>
        <linearGradient id="fp-logo-gradiente" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4aa0f7" />
          <stop offset="1" stop-color="#0071e3" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#fp-logo-gradiente)" />
      <path d="M22 18h22v7H30v6h11v7H30v8h-8z" fill="#fff" />
    </svg>
  `,
  styles: `
    :host { display: inline-flex; filter: drop-shadow(0 6px 14px rgba(0, 113, 227, 0.28)); }
    svg { display: block; }
  `,
})
export class LogoFlexpos {
  readonly tamano = input(40);
}
