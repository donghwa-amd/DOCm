import { Injectable } from '@angular/core';
import { fetchEventSource } from '@microsoft/fetch-event-source';

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
    url: string,
    onChunk: ((chunk: string) => void | Promise<void>)
  ): Promise<string> {
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
        onChunk("Sorry, you've sent too many requests. Please wait a moment before trying again.");
        return ""
      }
      if (!response.ok || !response.body) {
        onChunk("Sorry, the server could not be reached.");
        return "";
      }

      const stream = response.body.pipeThrough(new TextDecoderStream());
      for await (const delta of stream) {
        onChunk(delta);
      }
      return response.headers.get("Session-ID") || "";
    } catch (e: any) {
      if (controller.signal.aborted) {
        onChunk("Sorry, the request timed out. Please try again.");
        return "";
      }
      clearTimeout(timeoutId);
      onChunk("Sorry, the request failed. Please try again.");
      return "";
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
