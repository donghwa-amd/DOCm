import {
  Component,
  OnInit,
  resource,
  ResourceStreamItem,
  signal,
  WritableSignal,
} from '@angular/core';
import { marked } from 'marked';
import { StorageService } from './services/storage.service';
import { ResponseService } from './services/response.service';
import {
  ChatResultStream,
  ReasoningStreamEvent,
  FunctionCallStreamEvent,
  OutputStreamEvent
} from './shared/models';
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
   * This is used to control message inputs for the full duration of a streamed
   * response (including temporary network stalls), and is cleared only when the
   * stream finishes or an actual error is surfaced.
   */
  isAwaiting = signal(false);

  /**
   * A transient progress message shown during reasoning or executing tools.
   * 
   * Contains formatted HTML of the current progress status.
   */
  streamProgress = signal('');

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

  static readonly WELCOME_MESSAGE = 
    "Welcome to the ROCm Documentation!\n\nHow can I assist you today?";

  static readonly PROGRESS_LABELS: Record<string, string> = {
    retrieve_web_links: 'Searching for relevant pages...',
    fetch_page_content: 'Retrieving page content...',
  };

  constructor(
    /**
     * The storage service for persisting client-side chat data.
     */
    private storage: StorageService,
    /**
     * The API service for communicating with the assistant backend.
     */
    private chat: ResponseService
  ) {
    marked.use({ breaks: true });
  }

  /**
   *  Adds a new message to the chat history.
   * 
   * The message content is converted from Markdown to HTML format, then it is
   * appended to `messages`. If `save` is true, the message is also saved to
   * client-side storage.
   * 
   * @param content The message content in Markdown format.
   * @param type The author of the message.
   * @param save Whether to save the message to client-side storage.
    * @param final Whether this message is final output text. When `false`, this
    * indicates that the message is a status update.
   */
  private async addMessage(
    content: string,
    type: MessageAuthor,
    save: boolean = true,
    final: boolean = true
  ): Promise<void> {
    const parsed_content: string = await marked.parse(content);
    const message: ChatMessage = { turn: type, content: parsed_content, final };
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
    await this.addMessage(
      AssistantComponent.WELCOME_MESSAGE,
      MessageAuthor.Assistant,
      false
    );
    
    const messages = await this.storage.getChatMessages();
    if (messages && messages.length > 0) {
      this.messages.push(...messages);
    }
  }

  async ngOnInit() {
    // open the chat when the page is loaded
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
    await this.addMessage(
      AssistantComponent.WELCOME_MESSAGE,
      MessageAuthor.Assistant,
      false
    );
    
    const sessionId = await this.storage.getChatId();
    await this.chat.clearHistory(sessionId);
    await this.storage.clearDatabase();
  }

  private formatURLsList(
    args: Record<string, unknown> | undefined
  ): string {
    const urls: string[] | unknown = args?.['urls'];
    if (!Array.isArray(urls)) {
      return '';
    }
    return urls
      .filter((url): url is string => typeof url === 'string')
      .map((url) => `- ${url}`)
      .join('\n');
  }

  private getProgressLabel(
    event: ReasoningStreamEvent | FunctionCallStreamEvent
  ): string {
    if (event.type === 'reasoning') {
      // multiple reasoning steps may occur sequentially, so reasoning only
      // "ends" when another event type occurs
      return 'Thinking...';
    }

    switch (event.name) {
      case 'retrieve_web_links': {
        const label = AssistantComponent.PROGRESS_LABELS['retrieve_web_links'];
        return label;
      }
      case 'fetch_page_content': {
        const label = AssistantComponent.PROGRESS_LABELS['fetch_page_content'];
        return `${label}\n${this.formatURLsList(event.arguments)}`;
      }
      default:
        return "Processing...";
    }
  }

  /**
   * Handles a non-output stream event (reasoning/tool execution).
   *
   * Given a progress event message, this updates the `streamProgress` signal
   * with a formatted progress label. If the event is a completed tool call,
   * this also persists a status entry into `messages` with `final=false`.
   *
   * @param event The reasoning or tool-call event.
   */
  private async onProgressEvent(
    event: ReasoningStreamEvent | FunctionCallStreamEvent
  ): Promise<void> {
    const progress = this.getProgressLabel(event);
    const parsed_progress = await marked.parse(progress);
    this.streamProgress.set(parsed_progress);

    // persist completed tool calls
    if (event.status === 'completed' && event.type === 'function_call') {
      await this.addMessage(progress, MessageAuthor.Assistant, true, false);
    }
  }

  /**
   * Handles an output stream event (text delta).
   *
   * Clears `streamProgress` and updates the streamed assistant output shown in
   * the UI. To avoid re-parsing Markdown for every small delta, this re-parses
   * the entire cumulative Markdown only when the delta contains a newline;
   * otherwise it appends the delta to the existing rendered HTML string.
   *
   * @param event The output delta event.
   * @param cumulative The cumulative output Markdown text, including the
   * current delta.
   * @param output The output signal to update, containing the rendered
   * cumulative response so far.
   */
  private async onOutputEvent(
    event: OutputStreamEvent,
    cumulative: string,
    output: WritableSignal<ResourceStreamItem<string>>
  ): Promise<void> {
    this.streamProgress.set('');

    // only re-parse entire markdown on newlines, since Markdown formatting
    // really only changes on line breaks, else append raw delta to previous
    if (event.delta.includes("\n")) {
      const parsed_text = await marked.parse(cumulative);

      output.set({ value: parsed_text });
    }
    else {
      output.update((previous_text) => {
        if ('value' in previous_text) {
          return { value: `${previous_text.value}${event.delta}` };
        }
        return previous_text;
      });
    }
  }

  /**
   * Pipes the incoming stream into the output signal.
   * 
   * The stream can include both output text deltas and progress events.
   *
   * For non-output events (reasoning/tool execution), `streamProgress` is
   * updated with a formatted progress event message.
   *
   * For completed tool calls, a permanent status message is added to the chat
   * history `messages` with `final=false`.
   *
   * For output text deltas, the text is appended to the existing output. If the
   * delta contains a newline character, the entire text is formatted to HTML to
   * ensure proper formatting. Otherwise, the raw delta is appended to the
   * existing formatted output. `streamProgress` is cleared when output deltas
   * are received.
   * 
   * @param response The streamed response being generated. This stream may
   * include progress events (reasoning/tool execution) and output text deltas.
   * @param output The output signal to update, contains the entire response
   * generated so far.
   * @returns The complete Markdown output text containing all deltas.
   */
  private async pipeStream(
    response: ChatResultStream,
    output: WritableSignal<ResourceStreamItem<string>>
  ): Promise<string> {
    let text: string = "";
    for await (const event of response.stream) {
      if (event.type !== 'output') {
        await this.onProgressEvent(event);
        continue;
      }

      text += event.delta;
      await this.onOutputEvent(event, text, output);      
    }
    return text;
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
   * @param response The streamed response being generated, a stream of event
   * messages.
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
      const errorOutput = 'Sorry, something went wrong. Please refresh and try'
        + ' again later.';

      await this.addMessage(errorOutput, MessageAuthor.Assistant);
    }
    finally {
      // stream is completed, move text from streaming/error state to empty
      output.set({ value: "" });
      this.isAwaiting.set(false);
      this.streamProgress.set('');
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
        url,
        null
      );
 
      // immediately consume the stream in background, return immediately and
      // allow the stream to unblock inputs
      this.consumeStream(response, output);
      
      if (response.sessionId && sessionId !== response.sessionId) {
        await this.storage.saveChatId(response.sessionId);
      }
    }
    catch (e: any) {
      const errorOutput: string = e?.message
        ?? 'Sorry, the request failed. Please try again later.';
  
      await this.addMessage(errorOutput, MessageAuthor.Assistant);
  
      // error occurred, so clear any existing output and append the error
      output.set({ value: "" });
      this.isAwaiting.set(false);
      this.streamProgress.set('');
    }
  }
}
