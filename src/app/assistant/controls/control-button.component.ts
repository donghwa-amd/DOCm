import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'control-button',
  templateUrl: './control-button.component.html',
  styleUrl: './control-button.component.css',
  standalone: true
})
export class ControlButtonComponent {
  @Input() icon: string = '';
  @Input() title: string = '';
  @Input() buttonId: string = '';
  @Input() ariaLabel: string = '';
  @Output() action = new EventEmitter<void>();

  onClick(): void {
    this.action.emit();
  }
}
