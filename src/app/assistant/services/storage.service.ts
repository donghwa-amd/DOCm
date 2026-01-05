import { Injectable } from '@angular/core';
import { ChatMessage } from '../shared/models';

/**
 * Names of the object stores used in the browser's persisted storage.
 */
enum Datastore {
  History = "chat_history",
  Session = "chat_session"
} 

@Injectable({
  providedIn: 'root'
})
/**
 * Persists and retrieves chat session state in browser storage.
 *
 * Reads and writes persisted state on the client.
 */
export class StorageService {
  /**
   * The IndexedDB database name used to persist chat state.
   */
  private readonly CHAT_HISTORY_DB = "chat_database";

  /**
   * Key used to store the current session ID in the session object store.
   */
  private readonly SESSION_ID_KEY = "session_id";

  /**
   * Cached database handle promise to ensure a single open attempt.
   */
  private database?: Promise<IDBDatabase>;

  /**
   * Opens (or returns) the IndexedDB database used by this service.
   *
   * @returns A promise resolving to an open database connection.
   */
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

  /**
   * Wraps an IndexedDB request in a promise.
   *
   * @param request The request to await.
   * @returns A promise resolving to the request result.
   */
  private asPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Resolves when a transaction finishes, or rejects on error/abort.
   *
   * @param transaction The transaction to wait for.
   */
  private completeTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  /**
   * Persists the current chat session ID to the browser's IndexedDB.
   *
   * @param id The session identifier to store.
   */
  async saveChatId(id: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(Datastore.Session, "readwrite");
    transaction
      .objectStore(Datastore.Session)
      .put(id, this.SESSION_ID_KEY);
    await this.completeTransaction(transaction);
  }

  /**
   * Loads the persisted chat session ID.
   *
   * @returns The stored session ID, or an empty string if unavailable.
   */
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

  /**
   * Appends a single chat message to persisted history.
   *
   * @param message The message to store.
   */
  async saveChatMessage(message: ChatMessage) {
    const database = await this.openDatabase();
    const transaction = database.transaction(Datastore.History, "readwrite");
    transaction
      .objectStore(Datastore.History)
      .add(message);
    await this.completeTransaction(transaction);
  }

  /**
   * Loads all persisted chat messages.
   *
   * @returns Messages in storage order, or an empty list on failure.
   */
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

  /**
   * Clears all persisted chat history and session state.
   */
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
