import { Component, EventEmitter, Output, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'message-input',
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.css',
  standalone: true,
  imports: [FormsModule]
})
export class MessageInputComponent {
  @Output() send = new EventEmitter<string>();
  @ViewChild('textInput') textarea!: ElementRef;
  userInput: string = '';

  onSend(): void {
    if (this.userInput.trim()) {
      this.send.emit(this.userInput);
      this.userInput = '';
      this.resetHeight();
    }
  }

  onEnter(event: any) {
    if (!event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  adjustHeight(): void {
    const textarea = this.textarea.nativeElement;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  resetHeight(): void {
    if (this.textarea) {
      this.textarea.nativeElement.style.height = '';
    }
  }
}
