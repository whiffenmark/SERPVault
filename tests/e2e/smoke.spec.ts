import { test, expect, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', name: 'Dashboard' },
  { path: '/keywords', name: 'Keywords' },
  { path: '/upload', name: 'Upload' },
  { path: '/backlinks', name: 'Backlinks' },
  { path: '/competitor-pages', name: 'Competitor Pages' },
  { path: '/content-briefs', name: 'Content Briefs' },
  { path: '/export', name: 'Export' },
  { path: '/settings', name: 'Settings' },
];

async function navigateToPath(page: Page, path: string) {
  const shareUrl = process.env.VERCEL_SHARE_URL;
  if (shareUrl) {
    await page.goto(shareUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle');
  }
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Desktop Smoke Tests', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop only');

  for (const { path, name } of PAGES) {
    test(`renders ${name} page correctly`, async ({ page }) => {
      await navigateToPath(page, path);

      // Assert sidebar nav is visible
      const sidebarNav = page.locator('.sidebar-nav');
      await expect(sidebarNav).toBeVisible();

      // Assert page has a meaningful h1
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      const h1Text = await h1.innerText();
      expect(h1Text.trim().length).toBeGreaterThan(0);

      // Assert no Vercel login page text
      await expect(page.locator('body')).not.toContainText('Vercel Login', { ignoreCase: true });
      await expect(page.locator('body')).not.toContainText('Log in to Vercel', { ignoreCase: true });
    });
  }
});

test.describe('Mobile Smoke Tests', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile only');

  for (const { path, name } of PAGES) {
    test(`renders ${name} page correctly on mobile`, async ({ page }) => {
      await navigateToPath(page, path);

      // Assert the app renders SERPVault header
      const header = page.locator('.sidebar-header-bar');
      await expect(header).toContainText('SERPVault');

      // Assert the menu toggle is visible
      const toggle = page.locator('.sidebar-toggle-btn');
      await expect(toggle).toBeVisible();

      // Assert main content is not squeezed (main width > 320)
      const main = page.locator('.app-main');
      const box = await main.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(320);

      // Assert no horizontal document overflow beyond a small tolerance (e.g. 5px)
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      expect(overflow).toBeLessThanOrEqual(5);

      // Assert no Vercel login page text
      await expect(page.locator('body')).not.toContainText('Vercel Login', { ignoreCase: true });
      await expect(page.locator('body')).not.toContainText('Log in to Vercel', { ignoreCase: true });
    });
  }
});
