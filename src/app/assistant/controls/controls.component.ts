import { Component, EventEmitter, Output, Input } from '@angular/core';
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
}
