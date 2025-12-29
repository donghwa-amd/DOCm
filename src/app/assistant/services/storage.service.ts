import { Injectable } from '@angular/core';
import { ChatMessage } from '../shared/models';

enum Datastore {
  History = "chat_history",
  Session = "chat_session"
} 

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly CHAT_HISTORY_DB = "chat_database";
  private readonly SESSION_ID_KEY = "session_id";

  private openChatHistoryDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.CHAT_HISTORY_DB);
      request.onupgradeneeded = (event: any) => {
        const database = request.result;
        database.createObjectStore(
          Datastore.History,
          { keyPath: "id", autoIncrement: true }
        );
        database.createObjectStore(Datastore.Session);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async getDatastore(
    store: Datastore,
    mode: IDBTransactionMode
  ): Promise<IDBObjectStore> {
    const database = await this.openChatHistoryDatabase();
    return database
      .transaction(store, mode)
      .objectStore(store);
  }

  async saveChatId(id: string) {
    const store = await this.getDatastore(Datastore.Session, "readwrite");
    store.put(id, this.SESSION_ID_KEY);
  }

  async getChatId(): Promise<string> {
    const store = await this.getDatastore(Datastore.Session, "readonly");
    const request = store.get(this.SESSION_ID_KEY);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        console.log(request.result);
        resolve(request.result ?? "");
      };
      request.onerror = () => resolve("");
   });
  }

  async saveChatMessage(message: ChatMessage) {
    const store = await this.getDatastore(Datastore.History, "readwrite");
    store.add(message);
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    const store = await this.getDatastore(Datastore.History, "readonly");
    const request: IDBRequest<ChatMessage[]> = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const messages: ChatMessage[] = request.result;
        resolve(messages);
      };
      request.onerror = () => resolve([]);
    });
  }

  async clearDatabase() {
    const history = await this.getDatastore(Datastore.History, "readwrite");
    const session = await this.getDatastore(Datastore.Session, "readwrite");
    
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
