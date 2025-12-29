import { Injectable } from '@angular/core';
import { ChatResultStream, ChatError } from '../shared/models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly API_URL = (window as any).API_ENDPOINT;
  private readonly CHAT_TIMEOUT = 30000;
  private readonly CLEAR_TIMEOUT = 15000;

  async generateResponse(
    query: string,
    sessionId: string,
    url: string
  ): Promise<ChatResultStream> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CHAT_TIMEOUT);

    try {
      const response = await fetch(this.API_URL + "/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
          "Session-ID": sessionId
        },
        body: JSON.stringify({
          content: query,
          current_url: url
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      
      if (response.status === 429) {
        throw new ChatError(
          "Sorry, you've sent too many requests. Please wait a moment before "
          + "trying again.",
          {
            status: response.status
          }
        );
      }
      if (!response.ok || !response.body) {
        throw new ChatError('Sorry, the server could not be reached.', {
          status: response.status
        });
      }

      const validatedSessionId = response.headers.get('Session-ID') || "";
      const textStream = response.body.pipeThrough(new TextDecoderStream());

      return {
        sessionId: validatedSessionId,
        stream: textStream,
      };
    } catch (e: any) {
      clearTimeout(timeoutId);

      if (e instanceof ChatError)
        throw e;

      if (controller.signal.aborted) {
        throw new ChatError('Sorry, the request timed out. Please try again.', {
          cause: e,
        });
      }

      throw new ChatError('Sorry, the request failed. Please try again.', {
        cause: e,
      });
    }
  }

  async clearHistory(sessionId: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CLEAR_TIMEOUT);

    try {
      await fetch(this.API_URL + "/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Session-ID": sessionId
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return true;
    } catch (e) {
      clearTimeout(timeoutId);
      return false;
    }
  }
}
