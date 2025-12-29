import { Injectable } from '@angular/core';
import { ChatResultStream, ChatError } from '../shared/models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly API_URL = (window as any).API_ENDPOINT;
  private readonly TIMEOUT = 60000;

  async generateResponse(
    query: string,
    sessionId: string,
    url: string,
    timeout: number = this.TIMEOUT
  ): Promise<ChatResultStream> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

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
          current_url: url,
          session_id: sessionId // backwards compatibility
        }),
        signal: timeout ? controller.signal : null,
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
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

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
