import { describe, expect, it, vi } from 'vitest';
import { ElementRef, signal, type ResourceStreamItem } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssistantComponent } from './assistant.component';
import { MessageAuthor, type ChatResultStream, type StreamEvent } from './shared/models';

function makeEventStream(events: StreamEvent[]): ReadableStream<StreamEvent> {
  let index = 0;
  return new ReadableStream<StreamEvent>({
    pull(controller) {
      if (index >= events.length) {
        controller.close();
        return;
      }
      controller.enqueue(events[index]);
      index += 1;
    },
  });
}

function makeExampleEvents(): StreamEvent[] {
  return [
    { type: 'reasoning', status: 'in_progress' },
    { type: 'reasoning', status: 'completed' },
    {
      type: 'function_call',
      status: 'in_progress',
      message: 'Searching for relevant pages...',
    },
    {
      type: 'function_call',
      status: 'completed',
      message: 'Searching for relevant pages...',
    },
    { type: 'reasoning', status: 'in_progress' },
    { type: 'reasoning', status: 'completed' },
    {
      type: 'function_call',
      status: 'in_progress',
      message: 'Retrieving page content...',
    },
    {
      type: 'function_call',
      status: 'completed',
      message: 'Retrieving page content...',
      sources: [
        { title: 'ROCm Versions', url: 'https://rocm.docs.amd.com/en/latest/release/versions.html' },
      ],
    },
    { type: 'reasoning', status: 'in_progress' },
    { type: 'reasoning', status: 'completed' },
    { type: 'output', status: 'in_progress', delta: '**' },
    { type: 'output', status: 'in_progress', delta: 'Yes' },
    { type: 'output', status: 'in_progress', delta: ', ' },
    { type: 'output', status: 'in_progress', delta: 'the test' },
    { type: 'output', status: 'in_progress', delta: ' suite f' },
    { type: 'output', status: 'in_progress', delta: 'or the ' },
    { type: 'output', status: 'in_progress', delta: 'assistant' },
    { type: 'output', status: 'in_progress', delta: ' pas' },
    { type: 'output', status: 'in_progress', delta: 'ses' },
    { type: 'output', status: 'in_progress', delta: '!' },
  ];
}

function makeComponent() {
  const storage = {
    saveChatMessage: vi.fn().mockResolvedValue(undefined),
    getChatMessages: vi.fn().mockResolvedValue([]),
    getChatId: vi.fn().mockResolvedValue(''),
    saveChatId: vi.fn().mockResolvedValue(undefined),
    clearDatabase: vi.fn().mockResolvedValue(undefined),
  };
  const chat = {
    clearHistory: vi.fn().mockResolvedValue(true),
    generateResponse: vi.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: ElementRef, useValue: new ElementRef(document.createElement('docm-assistant')) },
    ],
  });
  const component = TestBed.runInInjectionContext(
    () => new AssistantComponent(storage as any, chat as any)
  );
  return { component, storage, chat };
}

async function runPipeStream(component: AssistantComponent, events: StreamEvent[]) {
  const response: ChatResultStream = {
    sessionId: 'test',
    stream: makeEventStream(events),
  };

  const output = signal<ResourceStreamItem<string>>({ value: '' });
  const { signal: abortSignal } = new AbortController();
  await (component as any).pipeStream(response, output, abortSignal);
}

async function runConsumeStream(
  component: AssistantComponent,
  events: StreamEvent[],
  output: ReturnType<typeof signal<ResourceStreamItem<string>>>
) {
  const response: ChatResultStream = {
    sessionId: 'test',
    stream: makeEventStream(events),
  };

  const { signal: abortSignal } = new AbortController();
  await (component as any).consumeStream(response, output, abortSignal);
}

describe('AssistantComponent stream events', () => {
  it('shows function_call message in progress spinner', async () => {
    const { component } = makeComponent();

    await runPipeStream(component, [
      {
        type: 'function_call',
        status: 'in_progress',
        message: 'Retrieving page content...',
      },
    ]);

    const html = component.streamProgress();
    expect(html).toContain('Retrieving page content...');
  });

  it('persists completed tool calls with source hyperlinks', async () => {
    const { component } = makeComponent();

    await runPipeStream(component, makeExampleEvents());

    // 2 completed tool calls persisted
    expect(component.messages).toHaveLength(2);

    const searchMessage = component.messages[0];
    expect(searchMessage.content).toContain('Searching for relevant pages...');

    const readMessage = component.messages[1];
    expect(readMessage.content).toContain('Retrieving page content...');
    // sources rendered as hyperlink
    expect(readMessage.content).toContain('href="https://rocm.docs.amd.com/en/latest/release/versions.html"');
    expect(readMessage.content).toContain('ROCm Versions');
  });

  it('consumeStream appends final output and clears signals', async () => {
    const { component, storage } = makeComponent();

    component.isAwaiting.set(true);
    component.streamProgress.set('<p>anything</p>');

    const output = signal<ResourceStreamItem<string>>({ value: '<p>temp</p>' });
    await runConsumeStream(component, makeExampleEvents(), output);

    expect(component.isAwaiting()).toBe(false);
    expect(component.streamProgress()).toBe('');

    const value: ResourceStreamItem<string> = output();
    if ('value' in value)
      expect(value.value).toBe('');
    else
      throw new Error('Output signal is missing value');

    // 2 completed tool calls become persistent + 1 final assistant output
    expect(component.messages).toHaveLength(3);
    expect(component.messages[2].turn).toBe(MessageAuthor.Assistant);
    expect(component.messages[2].content)
      .toContain('Yes, the test suite for the assistant passes!');

    expect(storage.saveChatMessage).toHaveBeenCalledTimes(3);
  });
});