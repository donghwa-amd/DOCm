import { Component, signal } from '@angular/core';
import { AssistantComponent } from './assistant/assistant.component';

@Component({
  selector: 'app-root',
  imports: [AssistantComponent],
  templateUrl: './app.html'
})
export class App {
  protected readonly title = signal('DOCm');
}
