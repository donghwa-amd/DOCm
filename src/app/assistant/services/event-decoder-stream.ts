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
        const name = value['name'];
        if (typeof name !== 'string') {
          return null;
        }
        const args = value['arguments'];
        const validated_args = this.isRecord(args) ? args : undefined;
        return { type, status, name, arguments: validated_args };
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
