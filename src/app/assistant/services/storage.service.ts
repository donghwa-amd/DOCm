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
  private database?: Promise<IDBDatabase>;

  private openDatabase(): Promise<IDBDatabase> {
    if (this.database) {
      return this.database;
    }

    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.CHAT_HISTORY_DB);
      request.onupgradeneeded = (event: any) => {
        const database = request.result;

        if (!database.objectStoreNames.contains(Datastore.History)) {
          database.createObjectStore(
            Datastore.History,
            { keyPath: "id", autoIncrement: true }
          );
        }

        if (!database.objectStoreNames.contains(Datastore.Session)) {
          database.createObjectStore(Datastore.Session);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.database;
  }

  private asPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private completeTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async saveChatId(id: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(Datastore.Session, "readwrite");
    transaction
      .objectStore(Datastore.Session)
      .put(id, this.SESSION_ID_KEY);
    await this.completeTransaction(transaction);
  }

  async getChatId(): Promise<string> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(Datastore.Session, "readonly");
      const request = transaction
        .objectStore(Datastore.Session)
        .get(this.SESSION_ID_KEY);

      const sessionId = await this.asPromise<string | undefined>(request);
      await this.completeTransaction(transaction);
      return sessionId ?? "";
    } catch {
      return "";
    }
  }

  async saveChatMessage(message: ChatMessage) {
    const database = await this.openDatabase();
    const transaction = database.transaction(Datastore.History, "readwrite");
    transaction
      .objectStore(Datastore.History)
      .add(message);
    await this.completeTransaction(transaction);
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(Datastore.History, "readonly");
      const request: IDBRequest<ChatMessage[]> = transaction
        .objectStore(Datastore.History)
        .getAll();

      const messages = await this.asPromise<ChatMessage[]>(request);
      await this.completeTransaction(transaction);
      return messages;
    } catch {
      return [];
    }
  }

  async clearDatabase() {
    const database = await this.openDatabase();
    const transaction = database.transaction(
      [Datastore.History, Datastore.Session],
      "readwrite"
    );

    const historyClear = transaction.objectStore(Datastore.History).clear();
    const sessionClear = transaction.objectStore(Datastore.Session).clear();

    await Promise.all([
      this.asPromise(historyClear),
      this.asPromise(sessionClear),
      this.completeTransaction(transaction)
    ]);
  }
}
