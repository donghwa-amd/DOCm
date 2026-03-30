import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssistantComponent } from './assistant.component';

function makeComponent(): { component: AssistantComponent; hostEl: HTMLElement } {
  const storage = {
    saveChatMessage: vi.fn().mockResolvedValue(undefined),
    getChatMessages: vi.fn().mockResolvedValue([]),
    getChatId: vi.fn().mockResolvedValue(''),
    saveChatId: vi.fn().mockResolvedValue(undefined),
    clearDatabase: vi.fn().mockResolvedValue(undefined),
  };
  const chat = { clearHistory: vi.fn(), generateResponse: vi.fn() };
  const hostEl = document.createElement('docm-assistant');

  TestBed.configureTestingModule({
    providers: [
      { provide: ElementRef, useValue: new ElementRef(hostEl) },
    ],
  });
  const component = TestBed.runInInjectionContext(
    () => new AssistantComponent(storage as any, chat as any)
  );
  return { component, hostEl };
}

describe('AssistantComponent theme sync', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('mirrors data-theme="dark" set before init', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { component, hostEl } = makeComponent();
    await component.ngOnInit();

    expect(hostEl.getAttribute('data-theme')).toBe('dark');
  });

  it('mirrors data-theme="light" set before init', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { component, hostEl } = makeComponent();
    await component.ngOnInit();

    expect(hostEl.getAttribute('data-theme')).toBe('light');
  });

  it('sets no data-theme when html element has none', async () => {
    const { component, hostEl } = makeComponent();
    await component.ngOnInit();

    expect(hostEl.hasAttribute('data-theme')).toBe(false);
  });

  it('updates host data-theme reactively when html attribute changes', async () => {
    const { component, hostEl } = makeComponent();
    await component.ngOnInit();

    document.documentElement.setAttribute('data-theme', 'dark');
    await new Promise<void>(r => setTimeout(r, 0));

    expect(hostEl.getAttribute('data-theme')).toBe('dark');
  });

  it('removes host data-theme reactively when html attribute is removed', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { component, hostEl } = makeComponent();
    await component.ngOnInit();

    document.documentElement.removeAttribute('data-theme');
    await new Promise<void>(r => setTimeout(r, 0));

    expect(hostEl.hasAttribute('data-theme')).toBe(false);
  });
});
