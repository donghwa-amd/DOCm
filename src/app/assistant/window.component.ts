import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { marked } from 'marked';
import { StorageService } from './services/storage.service';
import { ApiService } from './services/api.service';
import { ControlsComponent } from './controls/controls.component';
import { MessageListComponent } from './conversation/message-list.component';
import { MessageInputComponent } from './conversation/message-input.component';
import { MessageAuthor, ChatMessage, UserMessage, AssistantMessage } from './models';

/**
 * The Assistant window component containing the chat interface.
 * 
 * The entrypoint for the Documentation assistant chatbot UI, including all
 * subcomponents and logic for managing chat state and interactions.
 */
@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [FormsModule, ControlsComponent, MessageListComponent, MessageInputComponent],
  templateUrl: './window.component.html',
  styleUrl: './window.component.css',
  encapsulation: ViewEncapsulation.None
})
export class WindowComponent implements OnInit {
  /**
   * Whether the assistant window is active (visible). When the window is
   * inactive, only the toggle button is shown.
   */
  isActive = false;
  /**
   * Whether the assistant window is in fullscreen mode.
   */
  isFullscreen = false;
  isAwaiting = false;
  messages: ChatMessage[] = [];

  private readonly welcomeMessage = 
    "<p>Welcome to the ROCm Documentation!</p>" +
    "<p>How can I assist you today?</p>";

  constructor(
    private chatStorage: StorageService,
    private chatApi: ApiService
  ) {
    marked.use({ breaks: true });
  }

  async ngOnInit() {
    await this.loadChat();
  }

  toggleWindow() {
    this.isActive = !this.isActive;
    if (this.isFullscreen) {
      this.isFullscreen = false;
    }
  }

  maximizeWindow() {
    this.isFullscreen = true;
  }

  minimizeWindow() {
    this.isFullscreen = false;
  }

  async clearChat() {
    this.messages = [];
    this.messages.push(new AssistantMessage(this.welcomeMessage));
    
    const sessionId = await this.chatStorage.getChatId();
    await this.chatApi.clearHistory(sessionId);
    await this.chatStorage.clearDatabase();
  }

  async sendMessage(userInput: string) {
    if (!userInput.trim())
      return;
    
    const parsedInput: string = await marked.parse(userInput);
    const userMessage = new UserMessage(parsedInput);
    this.messages.push(userMessage);
    await this.chatStorage.saveChatMessage(userMessage);

    this.isAwaiting = true;
    
    let assistantOutput: string = "";
    const assistantMessage = new AssistantMessage("");
    this.messages.push(assistantMessage);
    
    const url: string = window.location.href;
    try {
      const sessionId: string = await this.chatStorage.getChatId();
      const response = await this.chatApi.generateResponse(
        userInput,
        sessionId,
        url,
        // async (chunk) => {
        //   if (!assistantOutput) {
        //     this.isAwaiting = false;
        //   }
        //   assistantOutput += chunk;

        //   // only re-parse entire markdown on newlines, otherwise appended raw
        //   if (chunk.includes("\n")) {
        //     const parsedOutput: string = await marked.parse(assistantOutput);
        //     assistantMessage.content = parsedOutput;
        //   }
        //   else {
        //     assistantMessage.content += chunk;
        //   }
        // }
      );

      if (response.session_id && sessionId !== response.session_id) {
        await this.chatStorage.saveChatId(response.session_id);
      }

      // final update, since last chunk may not contain newline
      assistantMessage.content = await marked.parse(response.content);
      await this.chatStorage.saveChatMessage(assistantMessage);
    }
    catch (e) {
      assistantMessage.content = "Sorry, the request timed out or failed. Please try again.";
    }
    finally {
      this.isAwaiting = false;
    }
  }

  private async loadChat() {
    const messages = await this.chatStorage.getChatMessages();
    this.messages = [new AssistantMessage(this.welcomeMessage)];
    if (messages && messages.length > 0) {
      this.messages.push(...messages);
    }
  }
}
