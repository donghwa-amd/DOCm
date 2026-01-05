import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AssistantComponent } from './app/assistant/assistant.component';

/*
 * Default API endpoint for the backend service. Mounted to the global scope
 * when imported, enabling the service to read it at runtime.
 */
(window as any).API_ENDPOINT ??= 'https://rainier-emersyn-sparely.ngrok-free.app';

const ASSISTANT_TAG_NAME = 'docm-assistant';

/**
 * Adds the custom assistant element to the document body.
 * 
 * This is the entry point for the assistant, and ensures that the element is
 * inserted into the DOM of the host document.
 */
function mount(): void {
  if (document.querySelector(ASSISTANT_TAG_NAME)) {
		return;
	}

	const body = document.body;
	if (!body) {
		return;
	}

	const assistant = document.createElement(ASSISTANT_TAG_NAME);
	body.appendChild(assistant);
}

/**
 * Mounts the assistant element once the document is ready.
 */
function onLoad(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
    return;
  }
  mount();
}

/**
 * Defines the custom element for the assistant component.
 * 
 * This function bootstraps an Angular application and registers the custom
 * element `<docm-assistant>`, enabling it to be used in any HTML document. Once
 * defined, the element can be inserted to integrate the assistant UI.
 */
async function defineAssistantElement(): Promise<void> {
  const app = await createApplication(appConfig);

  const element = createCustomElement(AssistantComponent, {
    injector: app.injector,
  });

  if (!customElements.get(ASSISTANT_TAG_NAME)) {
    customElements.define(ASSISTANT_TAG_NAME, element);
  }
}

defineAssistantElement()
  .then(() => onLoad())
  .catch((err) => console.error(err));
