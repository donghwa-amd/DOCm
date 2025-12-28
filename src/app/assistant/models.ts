export enum MessageAuthor {
  User = 'user',
  Assistant = 'assistant'
}

export interface ChatMessage {
  turn: MessageAuthor;
  content: string;
}

export class UserMessage implements ChatMessage {
  readonly turn = MessageAuthor.User;
  constructor(public content: string) {}
}

export class AssistantMessage implements ChatMessage {
  readonly turn = MessageAuthor.Assistant;
  constructor(public content: string) {}
}