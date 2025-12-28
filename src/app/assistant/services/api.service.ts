import { Injectable } from '@angular/core';
import { fetchEventSource } from '@microsoft/fetch-event-source';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly API_URL = (window as any).CHATBOT_SOURCE || 'http://localhost:8000';
  private readonly CHAT_TIMEOUT = 30000;
  private readonly CLEAR_TIMEOUT = 15000;

  async generateResponse(
    query: string,
    sessionId: string,
    url: string,
    onChunk: null | ((chunk: string) => void) = null
  ): Promise<{ content: string, session_id: string }> {
    if (onChunk)
      return this.generateResponseSSE(query, sessionId, url, onChunk);
    else
      return this.generateResponseStreaming(query, sessionId, url);
  }

  private async generateResponseSSE(
    query: string,
    sessionId: string,
    url: string,
    onChunk: (chunk: string) => void
  ): Promise<{ content: string, session_id: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CHAT_TIMEOUT);

    let accumulated = "";
    let validatedSessionId = "";

    try {
      await fetchEventSource(this.API_URL + "/chat", {
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
        async onopen(response) {
          if (response.ok) {
            validatedSessionId = response.headers.get("session-id") ?? "";
          } else if (response.status === 429) {
            const rateLimitReset = response.headers.get("ratelimit-reset");
            accumulated = `Sorry, please try again in ${rateLimitReset} seconds.`
          } else {
            throw new Error();
          }
        },
        onmessage(msg) {
          const chunk = msg.data;
          const text = JSON.parse(chunk);
          if (text) {
            accumulated += text;
            onChunk(text);
          }
        },
        onclose() {
          accumulated = "The server closed the connection unexpectedly."
        },
        onerror(err) {
          throw err;
        }
      });
      clearTimeout(timeoutId);
      return { content: accumulated, session_id: validatedSessionId };
    } catch (e: any) {
      if (controller.signal.aborted) {
        return {
          content: "Sorry, the request timed out. Please try again.",
          session_id: ""
        };
      }
      clearTimeout(timeoutId);
      throw e;
    }
  }

  private async generateResponseStreaming(
    query: string,
    sessionId: string,
    url: string
  ): Promise<{ content: string, session_id: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CHAT_TIMEOUT);

    try {
      const response = await fetch(this.API_URL + "/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: query,
          session_id: sessionId,
          current_url: url
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        return {
          content: "Sorry, you've sent too many requests. Please wait a moment before trying again.",
          session_id: ""
        };
      }
      if (!response.ok) {
        return {
          content: "Sorry, the server could not be reached.",
          session_id: ""
        };
      }

      return await response.json();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e?.name === 'AbortError') {
        return {
          content: "Sorry, the request timed out. Please try again.",
          session_id: ""
        };
      }
      return {
        content: "Sorry, the server response could not be processed.",
        session_id: ""
      };
    }
  }

  async clearHistory(sessionId: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CLEAR_TIMEOUT);

    try {
      await fetchEventSource(this.API_URL + "/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
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
