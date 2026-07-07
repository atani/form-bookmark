// puppeteer v23+ is ESM-only: load via dynamic import (requires
// NODE_OPTIONS=--experimental-vm-modules, see package.json test:e2e)
const path = require('path');
const http = require('http');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const TIMEOUT = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Form Bookmark Extension E2E', () => {
  let browser;
  let extensionId;

  beforeAll(async () => {
    const { default: puppeteer } = await import('puppeteer');

    // Chrome 137+ removed --load-extension, so use the CDP-based
    // extension install flow (enableExtensions + installExtension).
    const launchOptions = {
      headless: true,
      enableExtensions: true,
      pipe: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    };

    // Use PUPPETEER_EXECUTABLE_PATH if set (for CI)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    // installExtension returns the extension ID directly
    extensionId = await browser.installExtension(EXTENSION_PATH);

    if (!extensionId) {
      throw new Error('Failed to get extension ID. Extension may not have loaded.');
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
      // showAllBookmarks / includePasswords / autoRestore
      // (fuzzy match / env group toggles were removed in d22b213)
      const toggles = await popupPage.$$('.toggle-setting');
      expect(toggles.length).toBeGreaterThanOrEqual(3);
    }, TIMEOUT);

    test('showAllBookmarks toggle works', async () => {
      const initialState = await popupPage.$eval('#showAllBookmarks', el => el.checked);

      // The raw checkbox is visually hidden behind .toggle-slider,
      // so click via DOM instead of mouse coordinates
      await popupPage.$eval('#showAllBookmarks', el => el.click());
      await sleep(100);

      const newState = await popupPage.$eval('#showAllBookmarks', el => el.checked);
      expect(newState).toBe(!initialState);

      // Restore original state
      await popupPage.$eval('#showAllBookmarks', el => el.click());
      await sleep(100);
    }, TIMEOUT);

    test('manage environment groups button exists', async () => {
      const manageBtn = await popupPage.$('#manageEnvGroupsBtn');
      expect(manageBtn).not.toBeNull();
    }, TIMEOUT);

    test('environment groups dialog opens', async () => {
      // Open advanced settings
      const details = await popupPage.$('details.advanced-settings');
      await details.click();
      await sleep(100);

      // Click manage button
      const manageBtn = await popupPage.$('#manageEnvGroupsBtn');
      await manageBtn.click();
      await sleep(100);

      // Check dialog is visible
      const isHidden = await popupPage.$eval('#envGroupsDialog', el => el.classList.contains('hidden'));
      expect(isHidden).toBe(false);
    }, TIMEOUT);

    test('add environment group dialog opens', async () => {
      // Open advanced settings and env groups dialog
      await popupPage.click('details.advanced-settings');
      await sleep(100);
      await popupPage.click('#manageEnvGroupsBtn');
      await sleep(100);

      // Click add button
      await popupPage.click('#addEnvGroupBtn');
      await sleep(100);

      // Check edit dialog is visible
      const isHidden = await popupPage.$eval('#envGroupEditDialog', el => el.classList.contains('hidden'));
      expect(isHidden).toBe(false);
    }, TIMEOUT);
  });

  describe('Hidden input handling (regression: lolipop plan overwrite)', () => {
    let server;
    let serverUrl;

    const TEST_FORM_HTML = `<!DOCTYPE html>
      <html><body>
        <form>
          <input type="hidden" name="plan" value="4">
          <input type="text" name="username" value="">
        </form>
      </body></html>`;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(TEST_FORM_HTML);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      serverUrl = `http://127.0.0.1:${server.address().port}/order/`;
    }, TIMEOUT);

    afterAll(async () => {
      // Reset storage so other tests are unaffected
      const popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });
      await popupPage.evaluate(() => new Promise(resolve => {
        chrome.storage.local.set({ autoRestore: false }, () => {
          chrome.storage.sync.set({ bookmarks: [] }, resolve);
        });
      }));
      await popupPage.close();
      if (server) {
        // Destroy keep-alive sockets so close() doesn't hang
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    }, TIMEOUT);

    /**
     * Send a message to the content script of the tab that has our test form
     */
    async function sendToTestTab(popupPage, message) {
      return popupPage.evaluate(async (msg) => {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, msg);
            if (response && response.fields && ('name:username' in response.fields)) {
              return response;
            }
            if (response && response.results) {
              return response;
            }
          } catch {
            // Tab without content script (popup, chrome:// pages) - ignore
          }
        }
        return null;
      }, message);
    }

    test('getFormFields excludes hidden inputs', async () => {
      const formPage = await browser.newPage();
      await formPage.goto(serverUrl, { waitUntil: 'domcontentloaded' });
      await sleep(500);

      const popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });

      const response = await sendToTestTab(popupPage, { action: 'getFormFields' });
      expect(response).not.toBeNull();
      expect(response.fields['name:username']).toBeDefined();
      expect(response.fields['name:plan']).toBeUndefined();

      await popupPage.close();
      await formPage.close();
    }, TIMEOUT);

    test('restoreFormFields never writes into hidden inputs (legacy bookmarks)', async () => {
      const formPage = await browser.newPage();
      await formPage.goto(serverUrl, { waitUntil: 'domcontentloaded' });
      await sleep(500);

      const popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });

      // Legacy bookmark saved before hidden fields were excluded
      const legacyFields = {
        'name:plan': { type: 'hidden', value: '5' },
        'name:username': { type: 'text', value: 'restored-user' }
      };
      await sendToTestTab(popupPage, { action: 'restoreFormFields', fields: legacyFields });
      await sleep(300);

      const values = await formPage.evaluate(() => ({
        plan: document.querySelector('input[name="plan"]').value,
        username: document.querySelector('input[name="username"]').value
      }));
      expect(values.plan).toBe('4'); // hidden input must stay server-rendered
      expect(values.username).toBe('restored-user');

      await popupPage.close();
      await formPage.close();
    }, TIMEOUT);

    test('autoRestore does not overwrite hidden inputs', async () => {
      // Enable autoRestore with a legacy bookmark containing a hidden field
      const popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });
      await popupPage.evaluate((urlPattern) => new Promise(resolve => {
        chrome.storage.local.set({ autoRestore: true }, () => {
          chrome.storage.sync.set({
            bookmarks: [{
              id: 'test-bookmark',
              urlPattern,
              updatedAt: Date.now(),
              fields: {
                'name:plan': { type: 'hidden', value: '5' },
                'name:username': { type: 'text', value: 'auto-user' }
              }
            }]
          }, resolve);
        });
      }), serverUrl);
      await popupPage.close();

      const formPage = await browser.newPage();
      await formPage.goto(serverUrl, { waitUntil: 'domcontentloaded' });
      // content script init + 500ms auto-restore delay
      await sleep(2000);

      const values = await formPage.evaluate(() => ({
        plan: document.querySelector('input[name="plan"]').value,
        username: document.querySelector('input[name="username"]').value
      }));
      expect(values.plan).toBe('4'); // must stay server-rendered
      expect(values.username).toBe('auto-user');

      await formPage.close();
    }, TIMEOUT);
  });

  describe('Settings persistence', () => {
    test('toggle state persists after popup reload', async () => {
      // First popup session
      let popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });

      // Enable includePasswords
      await popupPage.$eval('#includePasswords', el => el.click());
      await sleep(200);
      await popupPage.close();

      // Second popup session
      popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
        waitUntil: 'domcontentloaded'
      });
      await sleep(200);

      const isChecked = await popupPage.$eval('#includePasswords', el => el.checked);
      expect(isChecked).toBe(true);

      // Cleanup: turn it back off
      await popupPage.$eval('#includePasswords', el => el.click());
      await sleep(100);
      await popupPage.close();
    }, TIMEOUT);
  });
});
