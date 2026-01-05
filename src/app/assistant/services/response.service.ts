import { Injectable } from '@angular/core';
import { ChatResultStream, ChatError } from '../shared/models';

@Injectable({
  providedIn: 'root'
})
export class ResponseService {
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
      const response = await fetch(this.API_URL + "/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
          "Session-ID": sessionId
        },
        body: JSON.stringify({
          content: query,
          current_url: url,
          stream: true
        }),
        signal: timeout ? controller.signal : null,
      });
      clearTimeout(timeoutId);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('RateLimit-Reset');
        throw new ChatError(
          "Sorry, you've sent too many requests too quickly. Please wait "
          + (retryAfter ? `${retryAfter}s` : "a moment") + " to try again.",
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

  async clearHistory(
    sessionId: string,
    timeout: number = this.TIMEOUT
  ): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      await fetch(this.API_URL + "/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Session-ID": sessionId
        },
        signal: timeout ? controller.signal : null,
      });
      return true;
    }
    catch (e) {
      return false;
    }
    finally {
      clearTimeout(timeoutId);
    }
  }
}
