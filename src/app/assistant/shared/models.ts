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

export type EventType = 'reasoning' | 'function_call' | 'output';
export type EventStatus = 'in_progress' | 'completed';

/**
 * A reasoning progress event from the assistant.
 */
export type ReasoningStreamEvent = {
  type: 'reasoning';
  status: EventStatus;
};

/**
 * A tool call progress event from the assistant.
 */
export type FunctionCallStreamEvent = {
  type: 'function_call';
  status: EventStatus;
  name: string;
  arguments?: Record<string, unknown>;
};

/**
 * An output text delta event from the assistant.
 */
export type OutputStreamEvent = {
  type: 'output';
  status: EventStatus;
  delta: string;
};

/**
 * A streaming event emitted by the assistant backend.
 */
export type StreamEvent =
  | ReasoningStreamEvent
  | FunctionCallStreamEvent
  | OutputStreamEvent;

/**
 * The result of a chat generation request, including the session ID that the
 * request is associated with and the text stream of the generated response.
 */
export type ChatResultStream = {
  sessionId: string;
  stream: ReadableStream<StreamEvent>;
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
