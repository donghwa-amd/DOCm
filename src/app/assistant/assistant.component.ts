import { Component, OnInit, resource, ResourceStreamItem, signal, ViewEncapsulation, WritableSignal } from '@angular/core';
import { marked } from 'marked';
import { StorageService } from './services/storage.service';
import { ApiService } from './services/api.service';
import { ChatResultStream } from './shared/models';
import { ControlsComponent } from './controls/controls.component';
import { MessageListComponent } from './conversation/message-list.component';
import { MessageInputComponent } from './conversation/message-input.component';
import { ChatMessage, MessageAuthor } from './shared/models';

/**
 * The Assistant window component containing the chat interface.
 * 
 * The entrypoint for the Documentation assistant chatbot UI, including all
 * subcomponents and logic for managing chat state and interactions.
 */
@Component({
  selector: 'assistant',
  standalone: true,
  imports: [ControlsComponent, MessageListComponent, MessageInputComponent],
  templateUrl: './assistant.component.html',
  styleUrl: './assistant.component.css',
  encapsulation: ViewEncapsulation.None
})
export class AssistantComponent implements OnInit {
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
  /**
   * The list of chat messages in the current session.
   * 
   * Messages are stored in chronological order.
   */
  messages: ChatMessage[] = [];

  /**
   * The user's current query. Updates trigger the assistant response resource
   * stream and begins generating a response.
   */
  private userRequest = signal("");

  /**
   * The assistant's response stream resource.
   * 
   * Tracks the streaming response from the assistant for the current user query
   * and enables the interface to display the response as it is generated live.
   * 
   * An empty string is used as the default value when there is no active query,
   * which represents that the assistant is available to send a response.
   * 
   * `params` defines the trigger for new requests, which will be invoked upon
   * any mutations to the `userRequest` signal.
   * 
   * `stream` sends the request to the API and consumes the streamed response,
   * updating the output signal with new content as it arrives.
   */
  assistantResponseStream = resource({
    defaultValue: "",
    params: () => this.userRequest(),
    stream: async ({params}) => {
      const output = signal<ResourceStreamItem<string>>({value: ''});

      // prevent doing anything on initial page load
      if (!params || !params.trim()) {
        return output;
      }

      await this.sendRequest(params, output);

      return output;
    }
  })

  private readonly welcomeMessage = 
    "<p>Welcome to the ROCm Documentation!</p>" +
    "<p>How can I assist you today?</p>";

  constructor(
    private chatStorage: StorageService,
    private chat: ApiService
  ) {
    marked.use({ breaks: true });
  }

  async ngOnInit() {
    await this.loadChat();
  }

  private async addMessage(
    content: string,
    type: MessageAuthor,
    save: boolean = true
  ) {
    const parsed_content: string = await marked.parse(content);
    const message: ChatMessage = { turn: type, content: parsed_content };
    this.messages.push(message);
    if (save) {
      await this.chatStorage.saveChatMessage(message);
    }
  }

  async onSend(userInput: string) {
    if (!userInput.trim()) {
      return;
    }

    await this.addMessage(userInput, MessageAuthor.User);

    this.userRequest.set(userInput);
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
    await this.addMessage(this.welcomeMessage, MessageAuthor.Assistant, false);
    
    const sessionId = await this.chatStorage.getChatId();
    await this.chat.clearHistory(sessionId);
    await this.chatStorage.clearDatabase();
  }

  /**
   * Appends incoming text deltas to the output and formats the text.
   * 
   * Upon every chunk of text received from the stream, the text is appended to
   * the existing output. If the delta contains a newline character, the entire
   * text is formatted to HTML to ensure proper formatting. Otherwise, the raw
   * delta is appended to the existing formatted output.
   * 
   * @param response The streamed response being generated, a stream of Markdown
   * text deltas.
   * @param output The output signal to update, contains the entire response
   * generated so far.
   * @returns The complete, fully formatted assistant response.
   */
  private async consumeChatStream(
    response: ChatResultStream,
    output: WritableSignal<ResourceStreamItem<string>>
  ): Promise<string> {
    let text: string = "";
    for await (const delta of response.stream) {
      text += delta;
      // only re-parse entire markdown on newlines
      if (delta.includes("\n")) {
        const parsed_text = await marked.parse(text);

        output.set({ value: parsed_text });
        continue;
      }
      // else append raw delta to previous output
      output.update((previous_text) => {
        if ('value' in previous_text)
          return { value: previous_text.value + delta };
        else
          return { error: delta as unknown as Error };
      });
    }
    return await marked.parse(text);
  }

  /**
   * Generates a response from the assistant for the given user query.
   * 
   * Sends the user query to the API to generate a streamed response from the
   * assistant. As the response is received, the output signal is updated with
   * new content to enable live streaming in the interface. Once the stream is
   * complete, the final assistant message is added to the chat history.
   * 
   * Once the request is sent, if the session identifier returned from the
   * assistant differs from the current session identifier, it is saved.
   * 
   * The consumption of the streamed response is processed in parallel.
   * 
   * @param query The user query to send to the assistant.
   * @param output The output signal to update live with the streamed response.
   * @returns A promise that resolves once the request is sent and the session
   * identifier from the assistant is saved, or when the request fails.
   */
  private async sendRequest(
    query: string,
    output: WritableSignal<ResourceStreamItem<string>>
  ): Promise<void> {
    const url: string = window.location.href;
    const sessionId: string = await this.chatStorage.getChatId();

    try {
      // var to avoid block scope in try-catch
      var response: ChatResultStream = await this.chat.generateResponse(
        query,
        sessionId,
        url
      );
    }
    catch (e: any) {
      output.set(e?.message || 'The request failed. Please try again.');
      return;
    }
    
    // immediately invoke lambda in background
    (async () => {
      const assistantOutput = await this.consumeChatStream(response, output);

      // stream is completed, move text from streaming state to final message
      output.set({ value: "" });
      await this.addMessage(assistantOutput, MessageAuthor.Assistant);
    })();
    
    if (response.sessionId && sessionId !== response.sessionId) {
      await this.chatStorage.saveChatId(response.sessionId);
    }
  }

  private async loadChat() {
    this.messages = [];
    await this.addMessage(this.welcomeMessage, MessageAuthor.Assistant, false);
    
    const messages = await this.chatStorage.getChatMessages();
    if (messages && messages.length > 0) {
      this.messages.push(...messages);
    }
  }
}
