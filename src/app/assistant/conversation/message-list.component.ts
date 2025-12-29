import { Component, Input, Resource, ResourceRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage } from '../models';

@Component({
  selector: 'message-list',
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None, // for injected styling
})
export class MessageListComponent {
  @Input() messages: ChatMessage[] = [];
  @Input() messageStream: ResourceRef<string> = {} as ResourceRef<string>;
}
