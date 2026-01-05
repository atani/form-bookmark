// Form Bookmark - Popup Script

(function() {
  'use strict';

  // i18n helper
  const i18n = {
    get: (key, ...substitutions) => chrome.i18n.getMessage(key, substitutions) || key,
    apply: () => {
      // Text content
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = i18n.get(el.dataset.i18n);
      });
      // Placeholders
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = i18n.get(el.dataset.i18nPlaceholder);
      });
      // Titles
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = i18n.get(el.dataset.i18nTitle);
      });
    }
  };

  // State
  let currentUrl = '';
  let currentTabId = null;
  let currentTitle = '';
  let bookmarks = [];
  let folders = [];
  let collapsedFolders = new Set();
  let editingBookmarkId = null;
  let deletingBookmarkId = null;
  let deletingFolderId = null;

  // DOM Elements
  const elements = {
    currentUrl: document.getElementById('currentUrl'),
    saveBtn: document.getElementById('saveBtn'),
    addFolderBtn: document.getElementById('addFolderBtn'),
    promptOnSubmit: document.getElementById('promptOnSubmit'),
    includePasswords: document.getElementById('includePasswords'),
    autoRestore: document.getElementById('autoRestore'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    bookmarksList: document.getElementById('bookmarksList'),
    saveDialog: document.getElementById('saveDialog'),
    bookmarkName: document.getElementById('bookmarkName'),
    folderSelect: document.getElementById('folderSelect'),
    cancelSave: document.getElementById('cancelSave'),
    confirmSave: document.getElementById('confirmSave'),
    folderDialog: document.getElementById('folderDialog'),
    folderName: document.getElementById('folderName'),
    cancelFolder: document.getElementById('cancelFolder'),
    confirmFolder: document.getElementById('confirmFolder'),
    editDialog: document.getElementById('editDialog'),
    editBookmarkName: document.getElementById('editBookmarkName'),
    cancelEdit: document.getElementById('cancelEdit'),
    confirmEdit: document.getElementById('confirmEdit'),
    deleteDialog: document.getElementById('deleteDialog'),
    deleteMessage: document.getElementById('deleteMessage'),
    cancelDelete: document.getElementById('cancelDelete'),
    confirmDelete: document.getElementById('confirmDelete'),
    toast: document.getElementById('toast')
  };

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
   * Normalize URL (remove query parameters and hash)
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
   * Show toast notification
   */
  function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    elements.toast.classList.remove('hidden');

    setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, 3000);
  }

  /**
   * Load data from storage
   */
  async function loadData() {
    return new Promise(resolve => {
      chrome.storage.local.get(['bookmarks', 'folders', 'collapsedFolders'], result => {
        bookmarks = result.bookmarks || [];
        folders = result.folders || [];
        collapsedFolders = new Set(result.collapsedFolders || []);
        resolve();
      });
    });
  }

  /**
   * Save data to storage
   */
  async function saveData() {
    return new Promise(resolve => {
      chrome.storage.local.set({
        bookmarks,
        folders,
        collapsedFolders: Array.from(collapsedFolders)
      }, resolve);
    });
  }

  /**
   * Load settings from storage
   */
  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(['promptOnSubmit', 'includePasswords', 'autoRestore'], result => {
        resolve({
          promptOnSubmit: result.promptOnSubmit || false,
          includePasswords: result.includePasswords || false,
          autoRestore: result.autoRestore || false
        });
      });
    });
  }

  /**
   * Save settings to storage
   */
  async function saveSettings(settings) {
    return new Promise(resolve => {
      chrome.storage.local.set(settings, resolve);
    });
  }

  /**
   * Get bookmarks for current URL
   */
  function getBookmarksForUrl(url) {
    const normalizedUrl = normalizeUrl(url);
    return bookmarks.filter(b => b.urlPattern === normalizedUrl);
  }

  /**
   * Get folders for current URL
   */
  function getFoldersForUrl(url) {
    const normalizedUrl = normalizeUrl(url);
    return folders.filter(f => f.urlPattern === normalizedUrl);
  }

  /**
   * Update folder select dropdown
   */
  function updateFolderSelect() {
    const urlFolders = getFoldersForUrl(currentUrl);
    elements.folderSelect.innerHTML = `
      <option value="">${i18n.get('rootFolder')}</option>
      ${urlFolders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
    `;
  }

  /**
   * Render bookmark item HTML
   */
  function renderBookmarkItem(bookmark) {
    return `
      <div class="bookmark-item" data-id="${bookmark.id}" data-type="bookmark">
        <div class="bookmark-info">
          <span class="bookmark-name">${escapeHtml(bookmark.name)}</span>
          <span class="bookmark-date">${formatDate(bookmark.updatedAt)}</span>
        </div>
        <div class="bookmark-actions">
          <button class="btn btn-small btn-restore" data-action="restore" title="${i18n.get('restore')}">
            ▶️
          </button>
          <button class="btn btn-small btn-edit" data-action="edit" title="${i18n.get('edit')}">
            ✏️
          </button>
          <button class="btn btn-small btn-delete" data-action="delete" title="${i18n.get('delete')}">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render folder item HTML
   */
  function renderFolderItem(folder, folderBookmarks) {
    const isCollapsed = collapsedFolders.has(folder.id);
    return `
      <div class="folder-item" data-id="${folder.id}" data-type="folder">
        <div class="folder-header">
          <div class="folder-info">
            <span class="folder-toggle ${isCollapsed ? 'collapsed' : ''}">▼</span>
            <span class="folder-icon">📁</span>
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            <span class="folder-count">${folderBookmarks.length}</span>
          </div>
          <div class="folder-actions">
            <button class="btn btn-small btn-delete" data-action="delete-folder" title="${i18n.get('delete')}">
              🗑️
            </button>
          </div>
        </div>
        <div class="folder-contents ${isCollapsed ? 'collapsed' : ''}">
          ${folderBookmarks.map(b => renderBookmarkItem(b)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render bookmarks list
   */
  function renderBookmarks() {
    const urlBookmarks = getBookmarksForUrl(currentUrl);
    const urlFolders = getFoldersForUrl(currentUrl);

    if (urlBookmarks.length === 0 && urlFolders.length === 0) {
      elements.bookmarksList.innerHTML = `<p class="empty-message">${i18n.get('noBookmarks')}</p>`;
      return;
    }

    // Group bookmarks by folder
    const rootBookmarks = urlBookmarks.filter(b => !b.folderId);
    const folderBookmarksMap = {};
    urlFolders.forEach(f => {
      folderBookmarksMap[f.id] = urlBookmarks.filter(b => b.folderId === f.id);
    });

    // Sort by updatedAt descending
    rootBookmarks.sort((a, b) => b.updatedAt - a.updatedAt);
    urlFolders.sort((a, b) => a.name.localeCompare(b.name));

    let html = '';

    // Render folders first
    urlFolders.forEach(folder => {
      const folderBookmarks = folderBookmarksMap[folder.id] || [];
      folderBookmarks.sort((a, b) => b.updatedAt - a.updatedAt);
      html += renderFolderItem(folder, folderBookmarks);
    });

    // Render root bookmarks
    rootBookmarks.forEach(bookmark => {
      html += renderBookmarkItem(bookmark);
    });

    elements.bookmarksList.innerHTML = html;

    // Add event listeners
    elements.bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
      item.addEventListener('click', handleBookmarkAction);
    });

    elements.bookmarksList.querySelectorAll('.folder-header').forEach(header => {
      header.addEventListener('click', handleFolderAction);
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Format date
   */
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const locale = chrome.i18n.getUILanguage();
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Handle folder action
   */
  function handleFolderAction(event) {
    const button = event.target.closest('button[data-action]');
    const folderItem = event.currentTarget.closest('.folder-item');
    const folderId = folderItem.dataset.id;

    if (button && button.dataset.action === 'delete-folder') {
      event.stopPropagation();
      openDeleteFolderDialog(folderId);
      return;
    }

    // Toggle folder
    toggleFolder(folderId);
  }

  /**
   * Toggle folder collapsed state
   */
  function toggleFolder(folderId) {
    if (collapsedFolders.has(folderId)) {
      collapsedFolders.delete(folderId);
    } else {
      collapsedFolders.add(folderId);
    }
    saveData();
    renderBookmarks();
  }

  /**
   * Handle bookmark action (restore, edit, delete)
   */
  function handleBookmarkAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    event.stopPropagation();

    const action = button.dataset.action;
    const bookmarkItem = event.currentTarget;
    const bookmarkId = bookmarkItem.dataset.id;
    const bookmark = bookmarks.find(b => b.id === bookmarkId);

    if (!bookmark) return;

    switch (action) {
      case 'restore':
        restoreBookmark(bookmark);
        break;
      case 'edit':
        openEditDialog(bookmark);
        break;
      case 'delete':
        openDeleteDialog(bookmark);
        break;
    }
  }

  /**
   * Restore bookmark
   */
  async function restoreBookmark(bookmark) {
    try {
      const response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'restoreFormFields',
        fields: bookmark.fields
      });

      if (response.success) {
        const { success, failed } = response.results;
        if (failed > 0) {
          showToast(i18n.get('toastRestoredPartial', success.toString(), failed.toString()), 'warning');
        } else {
          showToast(i18n.get('toastRestored', bookmark.name), 'success');
        }
      }
    } catch (error) {
      console.error('Restore error:', error);
      showToast(i18n.get('errorRestore'), 'error');
    }
  }

  /**
   * Open save dialog
   */
  function openSaveDialog() {
    elements.bookmarkName.value = currentTitle;
    updateFolderSelect();
    elements.saveDialog.classList.remove('hidden');
    elements.bookmarkName.focus();
    elements.bookmarkName.select();
  }

  /**
   * Close save dialog
   */
  function closeSaveDialog() {
    elements.saveDialog.classList.add('hidden');
    elements.bookmarkName.value = '';
  }

  /**
   * Save new bookmark
   */
  async function saveNewBookmark() {
    const name = elements.bookmarkName.value.trim();
    if (!name) {
      showToast(i18n.get('errorEnterName'), 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'getFormFields',
        includePasswords: elements.includePasswords.checked
      });

      if (!response.success) {
        showToast(i18n.get('errorGetForm'), 'error');
        return;
      }

      const fields = response.fields;
      if (Object.keys(fields).length === 0) {
        showToast(i18n.get('errorNoFields'), 'warning');
        return;
      }

      const folderId = elements.folderSelect.value || null;

      const newBookmark = {
        id: generateUUID(),
        name,
        urlPattern: normalizeUrl(currentUrl),
        folderId,
        fields,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      bookmarks.push(newBookmark);
      await saveData();
      renderBookmarks();
      closeSaveDialog();
      showToast(i18n.get('toastSaved', name), 'success');
    } catch (error) {
      console.error('Save error:', error);
      showToast(i18n.get('errorSave'), 'error');
    }
  }

  /**
   * Open folder dialog
   */
  function openFolderDialog() {
    elements.folderName.value = '';
    elements.folderDialog.classList.remove('hidden');
    elements.folderName.focus();
  }

  /**
   * Close folder dialog
   */
  function closeFolderDialog() {
    elements.folderDialog.classList.add('hidden');
    elements.folderName.value = '';
  }

  /**
   * Create new folder
   */
  async function createFolder() {
    const name = elements.folderName.value.trim();
    if (!name) {
      showToast(i18n.get('errorEnterName'), 'error');
      return;
    }

    const newFolder = {
      id: generateUUID(),
      name,
      urlPattern: normalizeUrl(currentUrl),
      createdAt: Date.now()
    };

    folders.push(newFolder);
    await saveData();
    renderBookmarks();
    closeFolderDialog();
    showToast(i18n.get('toastFolderCreated', name), 'success');
  }

  /**
   * Open edit dialog
   */
  function openEditDialog(bookmark) {
    editingBookmarkId = bookmark.id;
    elements.editBookmarkName.value = bookmark.name;
    elements.editDialog.classList.remove('hidden');
    elements.editBookmarkName.focus();
  }

  /**
   * Close edit dialog
   */
  function closeEditDialog() {
    elements.editDialog.classList.add('hidden');
    editingBookmarkId = null;
    elements.editBookmarkName.value = '';
  }

  /**
   * Update bookmark
   */
  async function updateBookmark() {
    const name = elements.editBookmarkName.value.trim();
    if (!name) {
      showToast(i18n.get('errorEnterName'), 'error');
      return;
    }

    const bookmark = bookmarks.find(b => b.id === editingBookmarkId);
    if (!bookmark) return;

    bookmark.name = name;
    bookmark.updatedAt = Date.now();

    await saveData();
    renderBookmarks();
    closeEditDialog();
    showToast(i18n.get('toastUpdated'), 'success');
  }

  /**
   * Open delete dialog
   */
  function openDeleteDialog(bookmark) {
    deletingBookmarkId = bookmark.id;
    deletingFolderId = null;
    elements.deleteMessage.textContent = i18n.get('deleteConfirmMessage', bookmark.name);
    elements.deleteDialog.classList.remove('hidden');
  }

  /**
   * Open delete folder dialog
   */
  function openDeleteFolderDialog(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    deletingFolderId = folderId;
    deletingBookmarkId = null;
    elements.deleteMessage.textContent = i18n.get('deleteFolderConfirm', folder.name);
    elements.deleteDialog.classList.remove('hidden');
  }

  /**
   * Close delete dialog
   */
  function closeDeleteDialog() {
    elements.deleteDialog.classList.add('hidden');
    deletingBookmarkId = null;
    deletingFolderId = null;
  }

  /**
   * Delete bookmark or folder
   */
  async function deleteItem() {
    if (deletingBookmarkId) {
      const index = bookmarks.findIndex(b => b.id === deletingBookmarkId);
      if (index === -1) return;

      const name = bookmarks[index].name;
      bookmarks.splice(index, 1);

      await saveData();
      renderBookmarks();
      closeDeleteDialog();
      showToast(i18n.get('toastDeleted', name), 'success');
    } else if (deletingFolderId) {
      const folderIndex = folders.findIndex(f => f.id === deletingFolderId);
      if (folderIndex === -1) return;

      const name = folders[folderIndex].name;

      // Move bookmarks in this folder to root
      bookmarks.forEach(b => {
        if (b.folderId === deletingFolderId) {
          b.folderId = null;
        }
      });

      folders.splice(folderIndex, 1);
      collapsedFolders.delete(deletingFolderId);

      await saveData();
      renderBookmarks();
      closeDeleteDialog();
      showToast(i18n.get('toastFolderDeleted', name), 'success');
    }
  }

  /**
   * Export data to JSON file
   */
  function exportData() {
    try {
      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        bookmarks,
        folders
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form-bookmark-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(i18n.get('toastExported'), 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast(i18n.get('errorExport'), 'error');
    }
  }

  /**
   * Import data from JSON file
   */
  function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Validate data structure
        if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
          showToast(i18n.get('errorImportInvalid'), 'error');
          return;
        }

        // Merge bookmarks (avoid duplicates by ID)
        const existingIds = new Set(bookmarks.map(b => b.id));
        const newBookmarks = data.bookmarks.filter(b => !existingIds.has(b.id));
        bookmarks.push(...newBookmarks);

        // Merge folders if present
        if (data.folders && Array.isArray(data.folders)) {
          const existingFolderIds = new Set(folders.map(f => f.id));
          const newFolders = data.folders.filter(f => !existingFolderIds.has(f.id));
          folders.push(...newFolders);
        }

        await saveData();
        renderBookmarks();
        showToast(i18n.get('toastImported', newBookmarks.length.toString()), 'success');
      } catch (error) {
        console.error('Import error:', error);
        showToast(i18n.get('errorImportInvalid'), 'error');
      }

      // Reset file input
      elements.importFile.value = '';
    };

    reader.readAsText(file);
  }

  /**
   * Initialize popup
   */
  async function init() {
    // Apply i18n translations
    i18n.apply();

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    currentUrl = tab.url;
    currentTitle = tab.title || '';

    // Display current URL
    elements.currentUrl.textContent = normalizeUrl(currentUrl);
    elements.currentUrl.title = currentUrl;

    // Load and render data
    await loadData();
    renderBookmarks();

    // Load settings
    const settings = await loadSettings();
    elements.promptOnSubmit.checked = settings.promptOnSubmit;
    elements.includePasswords.checked = settings.includePasswords;
    elements.autoRestore.checked = settings.autoRestore;

    // Settings change handlers
    elements.promptOnSubmit.addEventListener('change', async () => {
      await saveSettings({ promptOnSubmit: elements.promptOnSubmit.checked });
      // Notify content script of settings change
      chrome.tabs.sendMessage(currentTabId, {
        action: 'updateSettings',
        settings: { promptOnSubmit: elements.promptOnSubmit.checked }
      }).catch(() => {});
    });

    elements.includePasswords.addEventListener('change', async () => {
      await saveSettings({ includePasswords: elements.includePasswords.checked });
      // Notify content script of settings change
      chrome.tabs.sendMessage(currentTabId, {
        action: 'updateSettings',
        settings: { includePasswords: elements.includePasswords.checked }
      }).catch(() => {});
    });

    elements.autoRestore.addEventListener('change', async () => {
      await saveSettings({ autoRestore: elements.autoRestore.checked });
    });

    // Event listeners
    elements.saveBtn.addEventListener('click', openSaveDialog);
    elements.addFolderBtn.addEventListener('click', openFolderDialog);
    elements.exportBtn.addEventListener('click', exportData);
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', handleImport);
    elements.cancelSave.addEventListener('click', closeSaveDialog);
    elements.confirmSave.addEventListener('click', saveNewBookmark);
    elements.cancelFolder.addEventListener('click', closeFolderDialog);
    elements.confirmFolder.addEventListener('click', createFolder);
    elements.cancelEdit.addEventListener('click', closeEditDialog);
    elements.confirmEdit.addEventListener('click', updateBookmark);
    elements.cancelDelete.addEventListener('click', closeDeleteDialog);
    elements.confirmDelete.addEventListener('click', deleteItem);

    // Enter key support for dialogs
    elements.bookmarkName.addEventListener('keypress', e => {
      if (e.key === 'Enter') saveNewBookmark();
    });
    elements.folderName.addEventListener('keypress', e => {
      if (e.key === 'Enter') createFolder();
    });
    elements.editBookmarkName.addEventListener('keypress', e => {
      if (e.key === 'Enter') updateBookmark();
    });

    // Close dialogs on overlay click
    [elements.saveDialog, elements.folderDialog, elements.editDialog, elements.deleteDialog].forEach(dialog => {
      dialog.addEventListener('click', e => {
        if (e.target === dialog) {
          dialog.classList.add('hidden');
        }
      });
    });
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);
})();
