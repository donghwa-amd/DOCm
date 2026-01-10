import { JSONParser } from '@streamparser/json-whatwg';
import type { ParsedElementInfo } from '@streamparser/json/utils/types/parsedElementInfo.js';

/**
 * Decodes an NDJSON (newline-delimited JSON) stream from bytes to JSON objects.
 */
export class DelimitedJSONDecoderStream
  implements TransformStream<Iterable<number> | string, Record<string, unknown>>
{
  readonly writable: WritableStream<Iterable<number> | string>;
  readonly readable: ReadableStream<Record<string, unknown>>;

  constructor(separator: string = '\n') {
    const parser = new JSONParser({
      separator,
      keepStack: false,
    });

    
    const completedJSONFilter = new TransformStream<
      ParsedElementInfo,
      Record<string, unknown>
    > ({
      transform: (info, controller) => {
        if (info.parent !== undefined) {
          // having parent means it's not a root object, i.e. not event
          return;
        }

        const value = info.value;
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return;
        }

        controller.enqueue(value as Record<string, unknown>);
      },
    });

    this.writable = parser.writable;
    this.readable = parser.readable.pipeThrough(completedJSONFilter);
  }
}
