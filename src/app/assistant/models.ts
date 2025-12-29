/**
 * The author of a chat message.
 */
export enum MessageAuthor {
  User = 'user',
  Assistant = 'assistant'
}

/**
 * A chat message exchanged between the user and the assistant.
 */
export interface ChatMessage {
  turn: MessageAuthor;
  content: string;
}

/**
 * The result of a chat generation request, including the session ID that the
 * request is associated with and the text stream of the generated response.
 */
export type ChatResultStream = {
  sessionId: string;
  stream: ReadableStream<string>;
};

/**
 * An error that occurs during chat generation or communication with the API.
 */
export class ChatError extends Error {
  readonly status?: number;
  readonly sessionId?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'ChatError';
    this.status = options.status;
    (this as any).cause = options.cause;
  }
}
