import { Injectable } from '@angular/core';
import { ChatMessage } from '../models';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly CHAT_HISTORY_DB = "chat_database";
  private readonly CHAT_HISTORY_STORE = "chat_history";
  private readonly CHAT_SESSION_STORE = "chat_session";
  private readonly SESSION_ID_KEY = "session_id";

  private openChatHistoryDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.CHAT_HISTORY_DB);
      request.onupgradeneeded = (event: any) => {
        const database = request.result;
        database.createObjectStore(this.CHAT_HISTORY_STORE, { keyPath: "id", autoIncrement: true });
        database.createObjectStore(this.CHAT_SESSION_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveChatId(id: string) {
    const database = await this.openChatHistoryDatabase();
    const store = database
      .transaction(this.CHAT_SESSION_STORE, "readwrite")
      .objectStore(this.CHAT_SESSION_STORE);
    store.put(id, this.SESSION_ID_KEY);
  }

  async getChatId(): Promise<string> {
    const database = await this.openChatHistoryDatabase();
    const store = database
      .transaction(this.CHAT_SESSION_STORE, "readonly")
      .objectStore(this.CHAT_SESSION_STORE);
    const request = store.get(this.SESSION_ID_KEY);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result ?? "");
      request.onerror = () => resolve("");
   });
  }

  async saveChatMessage(message: ChatMessage) {
    const database = await this.openChatHistoryDatabase();
    const store = database
      .transaction(this.CHAT_HISTORY_STORE, "readwrite")
      .objectStore(this.CHAT_HISTORY_STORE);
    store.add(message);
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    const database = await this.openChatHistoryDatabase();
    const store = database
      .transaction(this.CHAT_HISTORY_STORE, "readonly")
      .objectStore(this.CHAT_HISTORY_STORE);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const results = request.result;
        const messages: ChatMessage[] = results.filter((item: any) => {
          typeof item.turn === 'string' && typeof item.content === 'string'
        });
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearDatabase() {
    const database = await this.openChatHistoryDatabase();
    const history = database
      .transaction(this.CHAT_HISTORY_STORE, "readwrite")
      .objectStore(this.CHAT_HISTORY_STORE);
    const session = database
      .transaction(this.CHAT_SESSION_STORE, "readwrite")
      .objectStore(this.CHAT_SESSION_STORE);
    
    const p1 = new Promise<void>((resolve, reject) => {
        const req = history.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
    const p2 = new Promise<void>((resolve, reject) => {
        const req = session.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
    
    return Promise.all([p1, p2]);
  }
}
