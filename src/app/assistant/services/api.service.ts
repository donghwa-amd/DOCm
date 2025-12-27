import { Injectable } from '@angular/core';
import { fetchEventSource } from '@microsoft/fetch-event-source';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly API_URL = (window as any).CHATBOT_SOURCE || 'http://localhost:8000';
  private readonly CHAT_TIMEOUT = 30000;
  private readonly CLEAR_TIMEOUT = 15000;

  async generateResponse(query: string, sessionId: any, url: string, onChunk: (chunk: string) => void): Promise<{ content: string, session_id: any }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CHAT_TIMEOUT);
    
    let accumulated = "";
    let validatedSessionId = null;

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
                    validatedSessionId = response.headers.get("session-id");
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
            return { content: "Sorry, the request timed out. Please try again.", session_id: null };
        }
        clearTimeout(timeoutId);
        throw e;
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
