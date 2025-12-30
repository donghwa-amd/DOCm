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

  /**
   * Whether the assistant is currently streaming a response.
   *
   * This is used to control message inputs for the full duration of a
   * streamed response (including temporary network stalls), and is cleared only
   * when the stream finishes or an actual error is surfaced.
   */
  isAwaiting = signal(false);

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
   * Once the user submits a query to the assistant with `onSend`, this signal
   * tracks the streaming response from the assistant with the total content
   * received so far, concatenated together, in HTML format.
   * 
   * Default value is an empty string.
   */
  assistantResponseStream = resource({
    defaultValue: "",
    // changes (or instantiation) to `userRequest` invokes `stream`
    params: () => this.userRequest(),
    // sends the request to the API and consumes the streamed response, updating
    // the output signal with new content as it arrives
    stream: async ({params}) => {
      // the output signal to update with the streamed response, this is the
      // read value of the resource
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
    "Welcome to the ROCm Documentation!\n\nHow can I assist you today?";

  constructor(
    /**
     * The storage service for persisting client-side chat data.
     */
    private storage: StorageService,
    /**
     * The API service for communicating with the assistant backend.
     */
    private chat: ApiService
  ) {
    marked.use({ breaks: true });
  }

  /**
   *  Adds a new message to the chat history.
   * 
   * The message content is parsed to HTML format, then it is appended to
   * `messages`. If `save` is true, the message is also saved to client-side
   * storage.
   * 
   * @param content The message content in Markdown format.
   * @param type The author of the message.
   * @param save Whether to save the message to client-side storage.
   */
  private async addMessage(
    content: string,
    type: MessageAuthor,
    save: boolean = true
  ): Promise<void> {
    const parsed_content: string = await marked.parse(content);
    const message: ChatMessage = { turn: type, content: parsed_content };
    this.messages.push(message);
    if (save) {
      await this.storage.saveChatMessage(message);
    }
  }

  /**
   * Retrieves and loads the chat history from client-side storage.
   */
  private async loadChat(): Promise<void> {
    this.messages = [];
    await this.addMessage(this.welcomeMessage, MessageAuthor.Assistant, false);
    
    const messages = await this.storage.getChatMessages();
    if (messages && messages.length > 0) {
      this.messages.push(...messages);
    }
  }

  async ngOnInit() {
    await this.loadChat();
  }

  /**
   * Handles sending a user input message to the assistant.
   * 
   * Once the user input is received, it is added to the client-side chat
   * history and a new request is initiated to generate a response from the
   * assistant. The `isAwaiting` signal is true until the response stream has
   * either fully completed, or an error has occurred.
   * 
   * If the user input is empty or whitespace, no action is taken.
   * 
   * @param userInput The user's input message.
   * @returns A promise that resolves once the message is sent.
   */
  async onSend(userInput: string): Promise<void> {
    if (!userInput.trim()) {
      return;
    }

    await this.addMessage(userInput, MessageAuthor.User);

    // lock input immediately; only unlock when the stream completes or errors.
    this.isAwaiting.set(true);

    this.userRequest.set(userInput);
  }

  /**
   * Toggles the assistant window between active and inactive states.
   * 
   * If the window is currently fullscreen, it is also restored to normal size.
   */
  toggleWindow() {
    this.isActive = !this.isActive;
    if (this.isFullscreen) {
      this.isFullscreen = false;
    }
  }

  /**
   * Maximizes the assistant window to fullscreen mode.
   */
  maximizeWindow() {
    this.isFullscreen = true;
  }

  /**
   * Restores the assistant window from fullscreen to normal size.
   */
  minimizeWindow() {
    this.isFullscreen = false;
  }

  /**
   * Clears the current chat history.
   * 
   * The client-side chat history is reset, and makes a request to clear the
   * server-side chat history.
   */
  async clearChat(): Promise<void> {
    this.messages = [];
    await this.addMessage(this.welcomeMessage, MessageAuthor.Assistant, false);
    
    const sessionId = await this.storage.getChatId();
    await this.chat.clearHistory(sessionId);
    await this.storage.clearDatabase();
  }

  /**
   * Pipes the incoming stream into the output signal.
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
  private async pipeStream(
    response: ChatResultStream,
    output: WritableSignal<ResourceStreamItem<string>>
  ): Promise<string> {
    let text: string = "";
    for await (const delta of response.stream) {
      text += delta;
      // only re-parse entire markdown on newlines, since Markdown formatting
      // really only changes on line breaks
      if (delta.includes("\n")) {
        const parsed_text = await marked.parse(text);

        output.set({ value: parsed_text });
        continue;
      }
      // else append raw delta to previous output
      output.update((previous_text) => {
        if ('value' in previous_text) {
          return { value: `${previous_text.value}${delta}` };
        }
        return previous_text;
      });
    }
    return await marked.parse(text);
  }

  /**
   * Consumes the entire response stream from the assistant.
   * 
   * The stream is piped into the output signal upon every new delta received.
   * Once the stream is complete, the final assistant message is added to the
   * chat history. If an error occurs during streaming, the error message is
   * added instead.
   * 
   * Once the stream is complete (or errors), the `isAwaiting` signal is set to
   * false.
   * 
   * @param response The streamed response being generated, a stream of Markdown
   * text deltas.
   * @param output The output signal to update, contains the entire response
   * generated so far.
   * @returns A promise that resolves once the stream is fully consumed.
   */
  private async consumeStream(
    response: ChatResultStream,
    output: WritableSignal<ResourceStreamItem<string>>
  ): Promise<void> {
    try {
      const assistantOutput = await this.pipeStream(response, output);

      await this.addMessage(assistantOutput, MessageAuthor.Assistant);
    }
    catch (e: any) {
      const errorOutput: string = e?.message
        ?? 'Sorry, something went wrong. Please try again later.';

      await this.addMessage(errorOutput, MessageAuthor.Assistant);
    }
    finally {
      // stream is completed, move text from streaming/error state to empty
      output.set({ value: "" });
      this.isAwaiting.set(false);
    }
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
   * The consumption of the streamed response is processed in parallel. The
   * `isAwaiting` signal will remain true until either the stream fully
   * completes, or an error occurs.
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
    const sessionId: string = await this.storage.getChatId();

    try {
      const response: ChatResultStream = await this.chat.generateResponse(
        query,
        sessionId,
        url
      );
 
      // immediately consume the stream in background, return immediately and
      // allow the stream to unblock inputs
      this.consumeStream(response, output);
      
      if (response.sessionId && sessionId !== response.sessionId) {
        await this.storage.saveChatId(response.sessionId);
      }
    }
    catch (e: any) {
      // error occurred, so clear any existing output and append the error
      output.set({ value: "" });
      
      const errorOutput: string = e?.message
        ?? 'Sorry, the request failed. Please try again later.';
      await this.addMessage(errorOutput, MessageAuthor.Assistant);

      this.isAwaiting.set(false);
    }
  }
}
