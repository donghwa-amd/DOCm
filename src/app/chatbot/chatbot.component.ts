import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { marked } from 'marked';
import { ChatStorageService } from './services/chat-storage.service';
import { ChatApiService } from './services/chat-api.service';

interface ChatMessage {
  type: 'incoming' | 'outgoing';
  content: string;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.css',
  encapsulation: ViewEncapsulation.None
})
export class ChatbotComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatBody') private chatBody!: ElementRef;

  isActive = false;
  isFullscreen = false;
  userInput = '';
  messages: ChatMessage[] = [];
  isAwaiting = false;

  private readonly welcomeMessage = 
    "<p>Welcome to the ROCm Documentation!</p>" +
    "<p>How can I assist you today?</p>";

  constructor(
    private chatStorage: ChatStorageService,
    private chatApi: ChatApiService
  ) {
    marked.use({ breaks: true });
  }

  async ngOnInit() {
    await this.loadChat();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.chatBody.nativeElement.scrollTop = this.chatBody.nativeElement.scrollHeight;
    } catch(err) { }
  }

  toggleAssistant() {
    this.isActive = !this.isActive;
  }

  maximize() {
    this.isFullscreen = true;
  }

  minimize() {
    this.isFullscreen = false;
  }

  async clearChat() {
    this.messages = [];
    this.messages.push({ type: 'incoming', content: this.welcomeMessage });
    
    const sessionId = await this.chatStorage.getChatId();
    await this.chatApi.clearHistory(sessionId);
    await this.chatStorage.clearDatabase();
  }

  onEnter(event: any) {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    const message = this.userInput.trim();
    if (!message) return;

    this.userInput = '';
    
    const outgoingMsg: ChatMessage = { type: 'outgoing', content: this.groupParagraphs(this.inlineCode(message)) };
    this.messages.push(outgoingMsg);
    await this.chatStorage.saveChatMessage(outgoingMsg.content, 'outgoing');

    this.isAwaiting = true;
    
    const sessionId = await this.chatStorage.getChatId();
    const url = window.location.href;
    
    let accumulated = "";
    let currentIncomingMsg: ChatMessage | null = null;

    try {
        const response = await this.chatApi.generateResponse(message, sessionId, url, async (chunk) => {
            if (!currentIncomingMsg) {
                this.isAwaiting = false;
                currentIncomingMsg = { type: 'incoming', content: '' };
                this.messages.push(currentIncomingMsg);
            }
            accumulated += chunk;
            
            const parsed = await marked.parse(accumulated);
            if (currentIncomingMsg) {
                currentIncomingMsg.content = parsed;
            }
        });

        if (response.session_id && sessionId !== response.session_id) {
            await this.chatStorage.saveChatId(response.session_id);
        }
        
        if (currentIncomingMsg) {
        } else if (response.content && !currentIncomingMsg) {
             const parsed = await marked.parse(response.content);
             const msg: ChatMessage = { type: 'incoming', content: parsed };
             this.messages.push(msg);
             await this.chatStorage.saveChatMessage(msg.content, 'incoming');
        }

    } catch (e) {
        console.error(e);
        if (!currentIncomingMsg) {
             this.messages.push({ type: 'incoming', content: "Sorry, the request timed out or failed. Please try again." });
        }
    } finally {
        this.isAwaiting = false;
    }
  }

  private groupParagraphs(text: string): string {
    return text
        .split(/\r?\n/)
        .filter(line => line.trim() !== "")
        .map(line => `<p>${line}</p>`)
        .join("");
  }

  private inlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  }

  private async loadChat() {
    const messages = await this.chatStorage.getChatMessages();
    if (messages && messages.length > 0) {
        this.messages = [{ type: 'incoming', content: this.welcomeMessage }];
        for (const msg of messages) {
            this.messages.push({ type: msg.type, content: msg.message });
        }
    } else {
        this.messages = [{ type: 'incoming', content: this.welcomeMessage }];
    }
  }
}
