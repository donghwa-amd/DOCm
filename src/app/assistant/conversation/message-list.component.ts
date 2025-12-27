import { Component, Input, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'message-list',
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
  standalone: true,
  imports: [CommonModule]
})
export class MessageListComponent implements AfterViewChecked {
  @Input() messages: any[] = [];
  @Input() isAwaiting: boolean = false;
  @ViewChild('messageList') private messageList!: ElementRef;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    const messageListElement: HTMLElement = this.messageList.nativeElement;

    messageListElement.scrollTop = messageListElement.scrollHeight;
  }
}
