import { Component, signal } from '@angular/core';
import { WindowComponent } from './assistant/window.component';

@Component({
  selector: 'app-root',
  imports: [WindowComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('DOCm');
}
