import { Component, EventEmitter, HostListener, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlButtonComponent } from './control-button.component';

@Component({
  selector: 'controls',
  templateUrl: './controls.component.html',
  styleUrl: './controls.component.css',
  standalone: true,
  imports: [ControlButtonComponent, CommonModule]
})
export class ControlsComponent {
  @Input() isFullscreen: boolean = false;
  @Output() clear = new EventEmitter<void>();
  @Output() maximize = new EventEmitter<void>();
  @Output() minimize = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onClear(): void {
    this.clear.emit();
  }

  onMaximize(): void {
    this.maximize.emit();
  }

  onMinimize(): void {
    this.minimize.emit();
  }

  onClose(): void {
    this.close.emit();
  }

  /** Minimizes the window when the Escape key is pressed while fullscreen. */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isFullscreen) {
      this.minimize.emit();
    }
  }

  /**
   * Minimizes the window when a click lands outside the chat panel while fullscreen.
   *
   * Uses `composedPath()` rather than `event.target` because shadow DOM retargets
   * `target` to the host element at the document level. A click is considered
   * "outside" if no element in the composed path has `id === 'window'`.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isFullscreen) return;
    const inWindow = event.composedPath().some(
      el => el instanceof Element && el.id === 'window'
    );
    if (!inWindow) {
      this.minimize.emit();
    }
  }
}
