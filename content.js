// Form Bookmark - Content Script
// Handles form field extraction and restoration

(function() {
  'use strict';

  // Settings state
  let settings = { promptOnSubmit: false, includePasswords: false, autoRestore: false };
  let pendingFormData = null;

  // Load settings on init
  chrome.storage.local.get(['promptOnSubmit', 'includePasswords', 'autoRestore', 'bookmarks'], result => {
    settings.promptOnSubmit = result.promptOnSubmit || false;
    settings.includePasswords = result.includePasswords || false;
    settings.autoRestore = result.autoRestore || false;

    if (settings.promptOnSubmit) {
      attachFormListeners();
    }

    // Auto-restore if enabled
    if (settings.autoRestore) {
      const bookmarks = result.bookmarks || [];
      autoRestoreForm(bookmarks);
    }
  });

  /**
   * Auto-restore form from matching bookmark
   */
  function autoRestoreForm(bookmarks) {
    const currentUrlPattern = normalizeUrl(window.location.href);

    // Find bookmarks matching current URL, sorted by most recent
    const matchingBookmarks = bookmarks
      .filter(b => b.urlPattern === currentUrlPattern)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (matchingBookmarks.length > 0) {
      // Use the most recently updated bookmark
      const bookmark = matchingBookmarks[0];

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          restoreFormFields(bookmark.fields);
        });
      } else {
        // Small delay to ensure dynamic forms are loaded
        setTimeout(() => {
          restoreFormFields(bookmark.fields);
        }, 500);
      }
    }
  }

  /**
   * Get a unique identifier for a form field
   */
  function getFieldIdentifier(element) {
    if (element.id) return `id:${element.id}`;
    if (element.name) return `name:${element.name}`;

    // Fallback: use a combination of tag, type, and position
    const parent = element.closest('form') || document.body;
    const siblings = Array.from(parent.querySelectorAll(element.tagName));
    const index = siblings.indexOf(element);
    const type = element.type || element.tagName.toLowerCase();
    return `pos:${element.tagName}[${type}]:${index}`;
  }

  /**
   * Get all form fields on the page
   * @param {boolean} includePasswords - Whether to include password fields
   */
  function getFormFields(includePasswords = false) {
    const fields = {};
    const selectors = 'input, select, textarea';
    const elements = document.querySelectorAll(selectors);

    elements.forEach(element => {
      // Skip hidden inputs that are likely CSRF tokens or similar
      if (element.type === 'hidden' && !element.name) return;
      // Skip submit/button types
      if (['submit', 'button', 'reset', 'image'].includes(element.type)) return;
      // Skip password fields unless explicitly included
      if (element.type === 'password' && !includePasswords) return;

      const identifier = getFieldIdentifier(element);

      if (element.type === 'checkbox') {
        fields[identifier] = {
          type: 'checkbox',
          value: element.checked
        };
      } else if (element.type === 'radio') {
        if (element.checked) {
          fields[identifier] = {
            type: 'radio',
            value: element.value,
            name: element.name
          };
        }
      } else if (element.tagName === 'SELECT') {
        if (element.multiple) {
          const selectedValues = Array.from(element.selectedOptions).map(opt => opt.value);
          fields[identifier] = {
            type: 'select-multiple',
            value: selectedValues
          };
        } else {
          fields[identifier] = {
            type: 'select',
            value: element.value
          };
        }
      } else {
        fields[identifier] = {
          type: element.type || 'text',
          value: element.value
        };
      }
    });

    return fields;
  }

  /**
   * Find an element by its identifier
   */
  function findElementByIdentifier(identifier) {
    const [type, value] = identifier.split(':');

    if (type === 'id') {
      return document.getElementById(value);
    } else if (type === 'name') {
      return document.querySelector(`[name="${value}"]`);
    } else if (type === 'pos') {
      // Parse position-based identifier
      const match = value.match(/^(\w+)\[([^\]]+)\]:(\d+)$/);
      if (match) {
        const [, tagName, fieldType, index] = match;
        const parent = document.body;
        const elements = Array.from(parent.querySelectorAll(tagName));
        return elements[parseInt(index)];
      }
    }
    return null;
  }

  /**
   * Trigger input events for framework compatibility (React, Vue, etc.)
   */
  function triggerInputEvents(element) {
    const events = ['input', 'change'];
    events.forEach(eventType => {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
    });
  }

  /**
   * Set value using native setter for React compatibility
   */
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter?.call(element, value);
    } else {
      valueSetter?.call(element, value);
    }

    // Fallback for non-React elements
    if (element.value !== value) {
      element.value = value;
    }
  }

  /**
   * Restore form fields from saved data
   */
  function restoreFormFields(fields) {
    const results = { success: 0, failed: 0 };

    // Handle radio buttons separately - group by name
    const radioGroups = {};

    Object.entries(fields).forEach(([identifier, fieldData]) => {
      if (fieldData.type === 'radio') {
        const name = fieldData.name;
        radioGroups[name] = fieldData.value;
        return;
      }

      const element = findElementByIdentifier(identifier);
      if (!element) {
        results.failed++;
        return;
      }

      try {
        if (fieldData.type === 'checkbox') {
          element.checked = fieldData.value;
          triggerInputEvents(element);
        } else if (fieldData.type === 'select-multiple') {
          Array.from(element.options).forEach(option => {
            option.selected = fieldData.value.includes(option.value);
          });
          triggerInputEvents(element);
        } else if (fieldData.type === 'select') {
          element.value = fieldData.value;
          triggerInputEvents(element);
        } else {
          setNativeValue(element, fieldData.value);
          triggerInputEvents(element);
        }
        results.success++;
      } catch (e) {
        console.error('Form Bookmark: Error restoring field', identifier, e);
        results.failed++;
      }
    });

    // Restore radio buttons
    Object.entries(radioGroups).forEach(([name, value]) => {
      const radio = document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
      if (radio) {
        radio.checked = true;
        triggerInputEvents(radio);
        results.success++;
      } else {
        results.failed++;
      }
    });

    return results;
  }

  /**
   * Create and show the save prompt dialog
   */
  function showSavePrompt() {
    // Remove existing dialog if any
    const existing = document.getElementById('form-bookmark-prompt');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'form-bookmark-prompt';
    dialog.innerHTML = `
      <style>
        #form-bookmark-prompt {
          position: fixed;
          top: 20px;
          right: 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          padding: 16px 20px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          max-width: 320px;
          animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        #form-bookmark-prompt .fb-message {
          margin-bottom: 12px;
          color: #333;
        }
        #form-bookmark-prompt .fb-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          margin-bottom: 12px;
          box-sizing: border-box;
        }
        #form-bookmark-prompt .fb-input:focus {
          outline: none;
          border-color: #4A90D9;
        }
        #form-bookmark-prompt .fb-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        #form-bookmark-prompt .fb-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          font-weight: 500;
        }
        #form-bookmark-prompt .fb-btn-save {
          background: #4A90D9;
          color: white;
        }
        #form-bookmark-prompt .fb-btn-save:hover {
          background: #3A7BC8;
        }
        #form-bookmark-prompt .fb-btn-skip {
          background: #e0e0e0;
          color: #333;
        }
        #form-bookmark-prompt .fb-btn-skip:hover {
          background: #d0d0d0;
        }
      </style>
      <div class="fb-message">${chrome.i18n.getMessage('submitPromptMessage')}</div>
      <input type="text" class="fb-input" placeholder="${chrome.i18n.getMessage('bookmarkNamePlaceholder')}" value="${document.title}" />
      <div class="fb-actions">
        <button class="fb-btn fb-btn-skip">${chrome.i18n.getMessage('submitPromptSkip')}</button>
        <button class="fb-btn fb-btn-save">${chrome.i18n.getMessage('submitPromptSave')}</button>
      </div>
    `;

    document.body.appendChild(dialog);

    const input = dialog.querySelector('.fb-input');
    const saveBtn = dialog.querySelector('.fb-btn-save');
    const skipBtn = dialog.querySelector('.fb-btn-skip');

    input.focus();
    input.select();

    saveBtn.addEventListener('click', () => {
      const name = input.value.trim();
      if (name && pendingFormData) {
        saveFormData(name, pendingFormData);
      }
      dialog.remove();
      pendingFormData = null;
    });

    skipBtn.addEventListener('click', () => {
      dialog.remove();
      pendingFormData = null;
    });

    input.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        saveBtn.click();
      }
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (dialog.parentNode) {
        dialog.remove();
        pendingFormData = null;
      }
    }, 30000);
  }

  /**
   * Save form data to storage
   */
  async function saveFormData(name, fields) {
    const urlPattern = normalizeUrl(window.location.href);
    const newBookmark = {
      id: generateUUID(),
      name,
      urlPattern,
      fields,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    chrome.storage.local.get(['bookmarks'], result => {
      const bookmarks = result.bookmarks || [];
      bookmarks.push(newBookmark);
      chrome.storage.local.set({ bookmarks });
    });
  }

  /**
   * Generate UUID
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Normalize URL
   */
  function normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Handle form submit
   */
  function handleFormSubmit(event) {
    if (!settings.promptOnSubmit) return;

    // Capture form data before submit (using current password setting)
    pendingFormData = getFormFields(settings.includePasswords);

    // Show prompt after a short delay (allow form to submit)
    setTimeout(() => {
      if (pendingFormData && Object.keys(pendingFormData).length > 0) {
        showSavePrompt();
      }
    }, 100);
  }

  /**
   * Attach listeners to all forms
   */
  function attachFormListeners() {
    document.querySelectorAll('form').forEach(form => {
      form.removeEventListener('submit', handleFormSubmit);
      form.addEventListener('submit', handleFormSubmit);
    });

    // Also observe for dynamically added forms
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'FORM') {
            node.addEventListener('submit', handleFormSubmit);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('form').forEach(form => {
              form.addEventListener('submit', handleFormSubmit);
            });
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Detach listeners from all forms
   */
  function detachFormListeners() {
    document.querySelectorAll('form').forEach(form => {
      form.removeEventListener('submit', handleFormSubmit);
    });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getFormFields') {
      const includePasswords = request.includePasswords || settings.includePasswords;
      const fields = getFormFields(includePasswords);
      sendResponse({ success: true, fields });
    } else if (request.action === 'restoreFormFields') {
      const results = restoreFormFields(request.fields);
      sendResponse({ success: true, results });
    } else if (request.action === 'updateSettings') {
      settings = { ...settings, ...request.settings };
      if (settings.promptOnSubmit) {
        attachFormListeners();
      } else {
        detachFormListeners();
      }
      sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
  });
})();
