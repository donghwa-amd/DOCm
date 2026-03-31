import { test, expect, type Page } from '@playwright/test';

// page selectors

function assistant(page: Page) {
  return page.locator('docm-assistant');
}

function userMessages(page: Page) {
  // message-list has ShadowDom encapsulation — chain locators to pierce both shadow roots
  return assistant(page).locator('message-list').locator('.message[data-turn="user"]');
}

function assistantMessages(page: Page) {
  return assistant(page).locator('message-list').locator('.message[data-turn="assistant"]');
}

function messageInput(page: Page) {
  return assistant(page).locator('#text-input');
}

/** opens the assistant window with a mocked API response */
async function openWindowWithRoute(
  page: Page,
  handler: Parameters<Page['route']>[1],
): Promise<void> {
  await page.route('**/chat', handler);
  await page.goto('/');
  await assistant(page).waitFor({ state: 'attached' });
  await assistant(page).locator('#toggle').click();
  await expect(assistant(page).locator('#window')).toBeVisible();
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await messageInput(page).fill(text);
  await messageInput(page).press('Enter');
}

/** Builds a newline-delimited NDJSON body string from an array of objects. */
function ndjson(events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

// ── Tests: response errors ───────────────────────────────────────────────────

test.describe('message UI — response errors', () => {
  test('user message not shown when request fails (500)', async ({ page }) => {
    await openWindowWithRoute(page, (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await sendMessage(page, 'Hello');

    // user message must not appear — request was not successful
    await expect(userMessages(page)).toHaveCount(0);

    // assistant error message appears (welcome message + error = 2)
    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('could not be reached');
  });

  test('user message not shown when rate limited (429)', async ({ page }) => {
    await openWindowWithRoute(page, (route) =>
      route.fulfill({
        status: 429,
        headers: { 'RateLimit-Reset': '30' },
        body: 'Too Many Requests',
      }),
    );

    await sendMessage(page, 'Hello');

    await expect(userMessages(page)).toHaveCount(0);

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('too many requests');
  });

  test('user message not shown on network failure', async ({ page }) => {
    await openWindowWithRoute(page, (route) => route.abort());

    await sendMessage(page, 'Hello');

    await expect(userMessages(page)).toHaveCount(0);

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('request failed');
  });

  test('user message shown on successful response (200)', async ({ page }) => {
    const body = ndjson([
      { type: 'output', status: 'in_progress', delta: 'Hi there' },
      { type: 'output', status: 'completed', delta: '!' },
    ]);

    await openWindowWithRoute(page, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Session-ID': 'test-session',
        },
        body,
      }),
    );

    await sendMessage(page, 'Hello');

    await expect(userMessages(page)).toHaveCount(1);
    await expect(userMessages(page).first()).toContainText('Hello');

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('Hi there!');
  });
});

// ── Tests: streaming ─────────────────────────────────────────────────────────

test.describe('message UI — streaming', () => {
  test('streaming output appears progressively and final text is correct', async ({ page }) => {
    const body = ndjson([
      { type: 'output', status: 'in_progress', delta: 'Hello' },
      { type: 'output', status: 'in_progress', delta: ' world' },
      { type: 'output', status: 'completed', delta: '!' },
    ]);

    await openWindowWithRoute(page, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Session-ID': 'test-session',
        },
        body,
      }),
    );

    await sendMessage(page, 'Hello');

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('Hello world!');
  });

  test('"Thinking..." progress event visible during reasoning, clears after output', async ({
    page,
  }) => {
    const body = ndjson([
      { type: 'reasoning', status: 'in_progress' },
      { type: 'output', status: 'completed', delta: 'Done.' },
    ]);

    await openWindowWithRoute(page, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Session-ID': 'test-session',
        },
        body,
      });
    });

    await sendMessage(page, 'Hello');

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('Done.');

    // transient progress spinner must be gone after stream completes
    const spinner = assistant(page).locator('message-list').locator('.progress-icon-spinner');
    await expect(spinner).toHaveCount(0);
  });

  test('error mid-stream shows error message', async ({ page }) => {
    // Truncated NDJSON causes a parse error mid-stream
    const body =
      JSON.stringify({ type: 'output', status: 'in_progress', delta: 'partial...' }) +
      '\n{"type":'; // incomplete JSON — will fail JSON.parse

    await openWindowWithRoute(page, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Session-ID': 'test-session',
        },
        body,
      }),
    );

    await sendMessage(page, 'Hello');

    // Request was 200 so user message should appear
    await expect(userMessages(page)).toHaveCount(1);

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(assistantMessages(page).last()).toContainText('something went wrong');
  });

  test('input is disabled while awaiting response', async ({ page }) => {
    // Route never resolves — component stays in isAwaiting=true
    await page.route('**/chat', () => { /* never fulfilled */ });
    await page.goto('/');
    await assistant(page).waitFor({ state: 'attached' });
    await assistant(page).locator('#toggle').click();
    await expect(assistant(page).locator('#window')).toBeVisible();

    await sendMessage(page, 'Hello');

    await expect(messageInput(page)).toBeDisabled();
  });
});

// ── Tests: clear chat ─────────────────────────────────────────────────────────

test.describe('message UI — clear chat', () => {
  test('clear while awaiting aborts request and shows only welcome message', async ({ page }) => {
    // Route resolves after a short delay so we can click Clear while still awaiting
    await page.route('**/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Session-ID': 'test-session',
        },
        body: ndjson([{ type: 'output', status: 'completed', delta: 'Hi!' }]),
      });
    });

    await page.goto('/');
    await assistant(page).waitFor({ state: 'attached' });
    await assistant(page).locator('#toggle').click();
    await expect(assistant(page).locator('#window')).toBeVisible();

    await sendMessage(page, 'Hello');

    // Click Clear while the request is still in-flight
    await assistant(page).getByRole('button', { name: /clear/i }).click();

    // User message must be suppressed
    await expect(userMessages(page)).toHaveCount(0);
    // Only the welcome message should remain
    await expect(assistantMessages(page)).toHaveCount(1);
  });

  test('clear when not awaiting resets to welcome message', async ({ page }) => {
    const body = ndjson([
      { type: 'output', status: 'completed', delta: 'Hi!' },
    ]);

    await openWindowWithRoute(page, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Session-ID': 'test-session',
        },
        body,
      }),
    );

    await sendMessage(page, 'Hello');

    // Wait for assistant to respond (welcome + reply = 2)
    await expect(assistantMessages(page)).toHaveCount(2);

    await assistant(page).getByRole('button', { name: /clear/i }).click();

    await expect(userMessages(page)).toHaveCount(0);
    await expect(assistantMessages(page)).toHaveCount(1);
  });
});
