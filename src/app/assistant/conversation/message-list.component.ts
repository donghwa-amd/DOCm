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
  /**
   * The list of chat messages in the conversation.
   *
   * Messages with `final === false` are treated as progress events and are
   * expected to be styled with the `progress-event` class.
   */
  @Input() messages: ChatMessage[] = [];

  /**
   * A resource reference containing the assistant's streamed response.
   * 
   * This is updated live with the cumulative response output as it's streamed.
   */
  @Input() messageStream: ResourceRef<string> = {} as ResourceRef<string>;

  /**
   * Whether a response is currently in progress.
   */
  @Input() isAwaiting: boolean = false;

  /**
   * The current status of the progress while streaming a response.
   */
  @Input() progressText: string = '';
}
