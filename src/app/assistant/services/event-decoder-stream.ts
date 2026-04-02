import { StreamEvent, EventStatus, EventType } from '../shared/models';

/**
 * Decodes JSON chunks into validated `StreamEvent` objects.
 * 
 * Provides a `TransformStream` that takes valid JSON objects and produces
 * well-formed `StreamEvent` instances. Invalid or unrecognized objects are
 * ignored.
 */
export class EventDecoderStream
  extends TransformStream<Record<string, unknown>, StreamEvent> {
  constructor() {
    super({
      transform: (chunk, controller) => {
        const event = EventDecoderStream.toStreamEvent(chunk);
        if (event) {
          controller.enqueue(event);
        }
      },
    });
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private static isEventType(value: unknown): value is EventType {
    return value === 'reasoning'
      || value === 'function_call'
      || value === 'output';
  }

  private static isEventStatus(value: unknown): value is EventStatus {
    return value === 'in_progress' || value === 'completed';
  }

  private static toStreamEvent(
    value: Record<string, unknown>
  ): StreamEvent | null {
    const type = value['type'];
    const status = value['status'];
    if (!this.isEventType(type) || !this.isEventStatus(status)) {
      return null;
    }

    switch (type) {
      case 'reasoning':
        return { type, status };
      case 'function_call': {
        const message = value['message'];
        if (typeof message !== 'string') {
          return null;
        }
        const rawSources = value['sources'];
        const sources = Array.isArray(rawSources)
          ? rawSources.filter(
              (s): s is { title: string; url: string } =>
                this.isRecord(s) &&
                typeof s['title'] === 'string' &&
                typeof s['url'] === 'string'
            )
          : undefined;
        return { type, status, message, ...(sources ? { sources } : {}) };
      }
      case 'output': {
        const delta = value['delta'];
        if (typeof delta !== 'string') {
          return null;
        }
        return { type, status, delta };
      }
    }

    return null;
  }
}
