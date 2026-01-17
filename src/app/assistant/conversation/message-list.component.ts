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
   * The value is rendered as HTML via `innerHTML`.
   */
  @Input() messageStream: ResourceRef<string> = {} as ResourceRef<string>;

  /**
   * Whether a response is currently in progress.
   * 
   * Controls whether to display the progress spinners during reasoning.
   */
  @Input() isAwaiting: boolean = false;

  /**
   * The current progress status message while streaming a response.
   *
   * This is rendered as HTML via `innerHTML`.
   */
  @Input() progressText: string = '';
}
