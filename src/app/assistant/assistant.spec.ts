import { describe, expect, it, vi } from 'vitest';
import { signal, type ResourceStreamItem } from '@angular/core';
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
      name: 'retrieve_web_links',
      arguments: { query: 'ROCm 7.1.1 latest version' },
    },
    {
      type: 'function_call',
      status: 'completed',
      name: 'retrieve_web_links',
      arguments: { query: 'ROCm 7.1.1 latest version' },
    },
    { type: 'reasoning', status: 'in_progress' },
    { type: 'reasoning', status: 'completed' },
    {
      type: 'function_call',
      status: 'in_progress',
      name: 'fetch_page_content',
      arguments: {
        urls: ['https://rocm.docs.amd.com/en/latest/release/versions.html'],
      },
    },
    {
      type: 'function_call',
      status: 'completed',
      name: 'fetch_page_content',
      arguments: {
        urls: ['https://rocm.docs.amd.com/en/latest/release/versions.html'],
      },
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

  TestBed.configureTestingModule({});
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
  await (component as any).pipeStream(response, output);
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

  await (component as any).consumeStream(response, output);
}

describe('AssistantComponent stream events', () => {
  it('renders fetch_page_content URLs as a Markdown list', async () => {
    const { component } = makeComponent();

    await runPipeStream(component, [
      {
        type: 'function_call',
        status: 'in_progress',
        name: 'fetch_page_content',
        arguments: {
          urls: [
            'https://rocm.docs.amd.com/en/latest/release/versions.html',
            'https://rocm.docs.amd.com/en/latest/',
          ],
        },
      },
    ]);

    const html = component.streamProgress();
    expect(html).toContain('<ul>');
    expect(html)
      .toContain('https://rocm.docs.amd.com/en/latest/release/versions.html');
    expect(html).toContain('https://rocm.docs.amd.com/en/latest/');
  });

  it('persists completed tool calls and output from the example stream', async () => {
    const { component } = makeComponent();

    await runPipeStream(component, makeExampleEvents());

    // 2 tool calls + 1 output message
    expect(component.messages).toHaveLength(2);

    const searchMessage = component.messages[0];
    expect(searchMessage.content)
      .toContain(AssistantComponent.PROGRESS_LABELS['retrieve_web_links']);

    const readMessage = component.messages[1];
    expect(readMessage.content)
      .toContain(AssistantComponent.PROGRESS_LABELS['fetch_page_content']);
    expect(readMessage.content)
      .toContain('https://rocm.docs.amd.com/en/latest/release/versions.html');
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