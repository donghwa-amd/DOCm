import { Component, Input, ResourceRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage } from '../shared/models';

@Component({
  selector: 'message-list',
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
  standalone: true,
  imports: [CommonModule],
  // required for styling to work with innerHTML modifications
  encapsulation: ViewEncapsulation.None
})
export class MessageListComponent {
  @Input() messages: ChatMessage[] = [];
  @Input() messageStream: ResourceRef<string> = {} as ResourceRef<string>;
}
