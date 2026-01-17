const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const TIMEOUT = 30000;

describe('Form Bookmark Extension E2E', () => {
  let browser;
  let extensionId;

  beforeAll(async () => {
    const launchOptions = {
      headless: 'new',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    };

    // Use PUPPETEER_EXECUTABLE_PATH if set (for CI)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    // Get extension ID from service worker
    const targets = await browser.targets();
    const extensionTarget = targets.find(
      target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
    );

    if (extensionTarget) {
      const url = extensionTarget.url();
      extensionId = url.match(/chrome-extension:\/\/([^/]+)/)[1];
    } else {
      // Fallback: find extension page
      const extensionPage = targets.find(
        target => target.url().includes('chrome-extension://')
      );
      if (extensionPage) {
        extensionId = extensionPage.url().match(/chrome-extension:\/\/([^/]+)/)[1];
      }
    }
  }, TIMEOUT);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Popup UI', () => {
    let popupPage;

    beforeEach(async () => {
      // Open popup in new tab (can't directly open popup, so open it as a page)
      popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });
    }, TIMEOUT);

    afterEach(async () => {
      if (popupPage) {
        await popupPage.close();
      }
    });

    test('popup loads successfully', async () => {
      const title = await popupPage.$eval('h1', el => el.textContent);
      expect(title).toContain('Form Bookmark');
    }, TIMEOUT);

    test('save button is present', async () => {
      const saveBtn = await popupPage.$('#saveBtn');
      expect(saveBtn).not.toBeNull();
    }, TIMEOUT);

    test('settings toggles are present', async () => {
      const toggles = await popupPage.$$('.toggle-setting');
      expect(toggles.length).toBeGreaterThanOrEqual(5);
    }, TIMEOUT);

    test('showAllBookmarks toggle works', async () => {
      const checkbox = await popupPage.$('#showAllBookmarks');
      const initialState = await popupPage.$eval('#showAllBookmarks', el => el.checked);

      await checkbox.click();
      await popupPage.waitForTimeout(100);

      const newState = await popupPage.$eval('#showAllBookmarks', el => el.checked);
      expect(newState).toBe(!initialState);
    }, TIMEOUT);

    test('fuzzySubdomainMatch toggle works', async () => {
      const checkbox = await popupPage.$('#fuzzySubdomainMatch');
      const initialState = await popupPage.$eval('#fuzzySubdomainMatch', el => el.checked);

      await checkbox.click();
      await popupPage.waitForTimeout(100);

      const newState = await popupPage.$eval('#fuzzySubdomainMatch', el => el.checked);
      expect(newState).toBe(!initialState);
    }, TIMEOUT);

    test('useEnvironmentGroups toggle works', async () => {
      const checkbox = await popupPage.$('#useEnvironmentGroups');
      const initialState = await popupPage.$eval('#useEnvironmentGroups', el => el.checked);

      await checkbox.click();
      await popupPage.waitForTimeout(100);

      const newState = await popupPage.$eval('#useEnvironmentGroups', el => el.checked);
      expect(newState).toBe(!initialState);
    }, TIMEOUT);

    test('manage environment groups button exists', async () => {
      const manageBtn = await popupPage.$('#manageEnvGroupsBtn');
      expect(manageBtn).not.toBeNull();
    }, TIMEOUT);

    test('environment groups dialog opens', async () => {
      // Open advanced settings
      const details = await popupPage.$('details.advanced-settings');
      await details.click();
      await popupPage.waitForTimeout(100);

      // Click manage button
      const manageBtn = await popupPage.$('#manageEnvGroupsBtn');
      await manageBtn.click();
      await popupPage.waitForTimeout(100);

      // Check dialog is visible
      const dialog = await popupPage.$('#envGroupsDialog');
      const isHidden = await popupPage.$eval('#envGroupsDialog', el => el.classList.contains('hidden'));
      expect(isHidden).toBe(false);
    }, TIMEOUT);

    test('add environment group dialog opens', async () => {
      // Open advanced settings and env groups dialog
      await popupPage.click('details.advanced-settings');
      await popupPage.waitForTimeout(100);
      await popupPage.click('#manageEnvGroupsBtn');
      await popupPage.waitForTimeout(100);

      // Click add button
      await popupPage.click('#addEnvGroupBtn');
      await popupPage.waitForTimeout(100);

      // Check edit dialog is visible
      const isHidden = await popupPage.$eval('#envGroupEditDialog', el => el.classList.contains('hidden'));
      expect(isHidden).toBe(false);
    }, TIMEOUT);
  });

  describe('Settings persistence', () => {
    test('toggle state persists after popup reload', async () => {
      // First popup session
      let popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });

      // Enable fuzzy matching
      await popupPage.click('#fuzzySubdomainMatch');
      await popupPage.waitForTimeout(200);
      await popupPage.close();

      // Second popup session
      popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });
      await popupPage.waitForTimeout(200);

      const isChecked = await popupPage.$eval('#fuzzySubdomainMatch', el => el.checked);
      expect(isChecked).toBe(true);

      // Cleanup: turn it back off
      await popupPage.click('#fuzzySubdomainMatch');
      await popupPage.waitForTimeout(100);
      await popupPage.close();
    }, TIMEOUT);
  });
});
