import { test, expect, type Page } from '@playwright/test';

async function openWindow(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('docm-assistant').waitFor({ state: 'attached' });
  await page.locator('docm-assistant').locator('#toggle').click();
  await expect(page.locator('docm-assistant').locator('#window')).toBeVisible();
}

async function maximizeWindow(page: Page): Promise<void> {
  await page.locator('docm-assistant').getByRole('button', { name: /maximize/i }).click();
  await expect(assistantDiv(page)).toHaveClass(/fullscreen/);
}

function assistantDiv(page: Page) {
  return page.locator('docm-assistant').locator('#assistant');
}

test.describe('window maximize/minimize', () => {
  test('clicking backdrop minimizes fullscreen window', async ({ page }) => {
    await openWindow(page);
    await maximizeWindow(page);

    await page.mouse.click(10, 10);

    await expect(assistantDiv(page)).not.toHaveClass(/fullscreen/);
  });

  test('ESC key minimizes fullscreen window', async ({ page }) => {
    await openWindow(page);
    await maximizeWindow(page);

    await page.keyboard.press('Escape');

    await expect(assistantDiv(page)).not.toHaveClass(/fullscreen/);
  });

  test('clicking inside #window does not minimize', async ({ page }) => {
    await openWindow(page);
    await maximizeWindow(page);

    const box = await page.locator('docm-assistant').locator('#window').boundingBox();
    if (!box) throw new Error('#window bounding box is null');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(assistantDiv(page)).toHaveClass(/fullscreen/);
  });

  test('backdrop click when not fullscreen has no effect', async ({ page }) => {
    await openWindow(page);
    await expect(assistantDiv(page)).not.toHaveClass(/fullscreen/);

    await page.mouse.click(10, 10);

    await expect(assistantDiv(page)).toHaveClass(/active/);
    await expect(assistantDiv(page)).not.toHaveClass(/fullscreen/);
  });
});
