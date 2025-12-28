import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'message-list',
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
  standalone: true,
  imports: [CommonModule]
})
export class MessageListComponent {
  @Input() messages: any[] = [];
  @Input() isAwaiting: boolean = false;
}
