import { describe, expect, it } from 'vitest';
import { EventDecoderStream } from './event-decoder-stream';
import { DelimitedJSONDecoderStream } from './delimited-json-decoder-stream';
import { StreamEvent } from '../shared/models';

async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const value of stream) {
    items.push(value);
  }
  return items;
}

function makeByteStream(textChunks: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    type: 'bytes',
    pull: (controller: any) => {
      if (index >= textChunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(textChunks[index]));
      index += 1;
    },
  } as any);
}

async function collectEvents(stream: ReadableStream<StreamEvent>): Promise<StreamEvent[]> {
  return collectStream(stream);
}

describe('EventDecoderStream', () => {
  it('sanity: DelimitedJSONDecoderStream yields root JSON objects', async () => {
    const ndjsonLines = [
      '{"type":"output","status":"in_progress","delta":"Hello"}\n',
      '{"type":"output","status":"completed","delta":"!"}\n',
    ];

    const byteStream = makeByteStream(ndjsonLines);
    const parsed = await collectStream(
      byteStream.pipeThrough(new DelimitedJSONDecoderStream('\n'))
    );

    expect(parsed).toEqual([
      { type: 'output', status: 'in_progress', delta: 'Hello' },
      { type: 'output', status: 'completed', delta: '!' },
    ]);
  });

  it('sanity: decoder reduces parser output to top-level StreamEvents', async () => {
    const ndjsonLines = [
      '{"type":"output","status":"in_progress","delta":"Hello"}\n',
      '{"type":"output","status":"completed","delta":"!"}\n',
    ];

    const byteStream = makeByteStream(ndjsonLines);
    const events = await collectEvents(
      byteStream
        .pipeThrough(new DelimitedJSONDecoderStream('\n'))
        .pipeThrough(new EventDecoderStream())
    );

    expect(events).toEqual([
      { type: 'output', status: 'in_progress', delta: 'Hello' },
      { type: 'output', status: 'completed', delta: '!' },
    ]);
  });

  it('decodes NDJSON bytes into StreamEvent objects', async () => {
    const ndjsonLines = [
      '{"type":"reasoning","status":"in_progress"}\n',
      '{"type":"function_call","status":"in_progress","name":"search","arguments":{"q":"rocm"}}\n',
      '{"type":"output","status":"in_progress","delta":"Hello"}\n',
      '{"type":"output","status":"in_progress","delta":" world"}\n',
      '{"type":"function_call","status":"completed","name":"search"}\n',
      '{"type":"reasoning","status":"completed"}\n',
      '{"type":"output","status":"completed","delta":"!"}\n',
    ];

    const byteStream = makeByteStream(ndjsonLines);
    const eventStream = byteStream
      .pipeThrough(new DelimitedJSONDecoderStream('\n'))
      .pipeThrough(new EventDecoderStream());

    const events = await collectEvents(eventStream);

    expect(events).toEqual([
      { type: 'reasoning', status: 'in_progress' },
      {
        type: 'function_call',
        status: 'in_progress',
        name: 'search',
        arguments: { q: 'rocm' },
      },
      { type: 'output', status: 'in_progress', delta: 'Hello' },
      { type: 'output', status: 'in_progress', delta: ' world' },
      { type: 'function_call', status: 'completed', name: 'search' },
      { type: 'reasoning', status: 'completed' },
      { type: 'output', status: 'completed', delta: '!' },
    ]);
  });

  it('handles JSON chunk boundaries (split lines) like an HTTP byte stream', async () => {
    const byteStream = makeByteStream([
      '{"type":"output","status":"in_progress","delta":"Hel',
      'lo"}\n{"type":"output","status":"completed","delta":"!"}\n',
    ]);

    const eventStream = byteStream
      .pipeThrough(new DelimitedJSONDecoderStream('\n'))
      .pipeThrough(new EventDecoderStream());

    const events = await collectEvents(eventStream);

    expect(events).toEqual([
      { type: 'output', status: 'in_progress', delta: 'Hello' },
      { type: 'output', status: 'completed', delta: '!' },
    ]);
  });
  
  it('ignores malformed or unknown events', async () => {
    const byteStream = makeByteStream([
      '{"type":"output","status":"in_progress"}\n',
      '{"type":"unknown","status":"in_progress"}\n',
      '{"type":"function_call","status":"in_progress","name":123}\n',
      '{"type":"output","status":"completed","delta":"ok"}\n',
    ]);

    const eventStream = byteStream
      .pipeThrough(new DelimitedJSONDecoderStream('\n'))
      .pipeThrough(new EventDecoderStream());

    const events = await collectEvents(eventStream);

    expect(events).toEqual([{ type: 'output', status: 'completed', delta: 'ok' }]);
  });
});
