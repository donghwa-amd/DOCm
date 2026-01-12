import { Injectable } from '@angular/core';
import { ChatResultStream, ChatError } from '../shared/models';
import { DelimitedJSONDecoderStream } from './delimited-json-decoder-stream';
import { EventDecoderStream } from './event-decoder-stream';

@Injectable({
  providedIn: 'root'
})
/**
 * Sends chat requests to the backend and returns streamed responses.
 * 
 * The API endpoint for the backend is configurable via the global scope
 * `window.API_ENDPOINT` variable, which should be the base URL of the backend
 * API. This endpoint is read at class instantiation, and used for all requests.
 */
export class ResponseService {
  /**
   * Base URL for the backend API endpoint.
   */
  private readonly API_URL = (window as any).API_ENDPOINT;

  /**
   * Default request timeout in milliseconds.
   */
  private readonly TIMEOUT = 120000;

  /**
   * Sends a prompt to the backend and returns a streaming response.
   * 
   * Obtains the assistant response for the given user query, as well as the
   * session ID that the response is associated with.
   * 
   * Incremental response deltas are streamed as they are produced, enabling
   * real-time consumption of assistant output. Each chunk is a raw Markdown
   * text delta, consisting of only the newly generated text since the last
   * chunk.
   * 
   * Additionally, the response is associated with a session ID that identifies
   * the current user session. This ID should be persisted client-side and
   * provided with subsequent requests to maintain context.
   * 
   * If the session ID is `None` or if there is no existing session associated
   * with the ID, a new session will be automatically created and its ID will be
   * returned in the response.
   *
   * @param query User prompt to generate a response for.
   * @param sessionId Current session identifier.
   * @param url Current page URL/context.
   * @param timeout Request timeout in milliseconds, defaults to 120 seconds.
   * @returns The generated response stream and validated session ID.
   * @throws ChatError When the request fails, times out, or is rate-limited.
   */
  async generateResponse(
    query: string,
    sessionId: string,
    url: string,
    timeout: number | null = this.TIMEOUT
  ): Promise<ChatResultStream> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(), timeout ?? this.TIMEOUT
    );

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
      const eventStream = response.body
        .pipeThrough(new DelimitedJSONDecoderStream('\n'))
        .pipeThrough(new EventDecoderStream());

      return {
        sessionId: validatedSessionId,
        stream: eventStream,
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

  /**
   * Clears the server-side history/session state.
   *
   * @param sessionId Current session identifier.
   * @param timeout Request timeout in milliseconds, defaults to 120 seconds.
   * @returns True if the request was sent; false on failure.
   */
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
