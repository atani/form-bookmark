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
  let environmentGroups = [];
  let editingEnvGroupId = null;
  let editingEnvPatterns = [];

  // Settings state
  let matchSettings = {
    showAllBookmarks: false,
    fuzzySubdomainMatch: false,
    useEnvironmentGroups: false
  };

  // DOM Elements
  const elements = {
    currentUrl: document.getElementById('currentUrl'),
    saveBtn: document.getElementById('saveBtn'),
    addFolderBtn: document.getElementById('addFolderBtn'),
    includePasswords: document.getElementById('includePasswords'),
    autoRestore: document.getElementById('autoRestore'),
    showAllBookmarks: document.getElementById('showAllBookmarks'),
    fuzzySubdomainMatch: document.getElementById('fuzzySubdomainMatch'),
    useEnvironmentGroups: document.getElementById('useEnvironmentGroups'),
    manageEnvGroupsBtn: document.getElementById('manageEnvGroupsBtn'),
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
    envGroupsDialog: document.getElementById('envGroupsDialog'),
    envGroupsList: document.getElementById('envGroupsList'),
    addEnvGroupBtn: document.getElementById('addEnvGroupBtn'),
    closeEnvGroups: document.getElementById('closeEnvGroups'),
    envGroupEditDialog: document.getElementById('envGroupEditDialog'),
    envGroupEditTitle: document.getElementById('envGroupEditTitle'),
    envGroupName: document.getElementById('envGroupName'),
    envPatternsList: document.getElementById('envPatternsList'),
    newEnvPattern: document.getElementById('newEnvPattern'),
    addEnvPatternBtn: document.getElementById('addEnvPatternBtn'),
    cancelEnvGroupEdit: document.getElementById('cancelEnvGroupEdit'),
    confirmEnvGroupEdit: document.getElementById('confirmEnvGroupEdit'),
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
   * Normalize URL for fuzzy matching (remove numbers from subdomain)
   * e.g., https://hoge-111.hoge.com -> https://hoge-.hoge.com
   */
  function normalizeUrlFuzzy(url) {
    try {
      const urlObj = new URL(url);
      // Remove numbers from hostname
      const fuzzyHost = urlObj.hostname.replace(/\d+/g, '');
      return `${urlObj.protocol}//${fuzzyHost}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Get URL origin for environment group matching
   */
  function getUrlOrigin(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin;
    } catch {
      return url;
    }
  }

  /**
   * Get environment group for a URL
   */
  function getEnvironmentGroupForUrl(url) {
    const origin = getUrlOrigin(url);
    return environmentGroups.find(group =>
      group.patterns.some(pattern => {
        try {
          const patternOrigin = getUrlOrigin(pattern);
          return patternOrigin === origin;
        } catch {
          return false;
        }
      })
    );
  }

  /**
   * Get all origins in the same environment group as the given URL
   */
  function getGroupedOrigins(url) {
    const group = getEnvironmentGroupForUrl(url);
    if (!group) return [getUrlOrigin(url)];
    return group.patterns.map(p => getUrlOrigin(p));
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
   * Load data from storage (using sync for persistence)
   */
  async function loadData() {
    return new Promise(resolve => {
      chrome.storage.sync.get(['bookmarks', 'folders', 'collapsedFolders'], result => {
        bookmarks = result.bookmarks || [];
        folders = result.folders || [];
        collapsedFolders = new Set(result.collapsedFolders || []);
        resolve();
      });
    });
  }

  /**
   * Save data to storage (using sync for persistence)
   */
  async function saveData() {
    return new Promise(resolve => {
      chrome.storage.sync.set({
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
      chrome.storage.local.get([
        'includePasswords',
        'autoRestore',
        'showAllBookmarks',
        'fuzzySubdomainMatch',
        'useEnvironmentGroups',
        'environmentGroups'
      ], result => {
        environmentGroups = result.environmentGroups || [];
        matchSettings = {
          showAllBookmarks: result.showAllBookmarks || false,
          fuzzySubdomainMatch: result.fuzzySubdomainMatch || false,
          useEnvironmentGroups: result.useEnvironmentGroups || false
        };
        resolve({
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
   * Save environment groups to storage
   */
  async function saveEnvironmentGroups() {
    return new Promise(resolve => {
      chrome.storage.local.set({ environmentGroups }, resolve);
    });
  }

  // Storage constants
  const STORAGE_QUOTA = 102400; // 100KB in bytes
  const STORAGE_WARNING_THRESHOLD = 0.9; // 90%

  /**
   * Get current storage usage
   */
  async function getStorageUsage() {
    return new Promise(resolve => {
      chrome.storage.sync.getBytesInUse(null, bytesInUse => {
        resolve(bytesInUse);
      });
    });
  }

  /**
   * Format bytes to human readable string
   */
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  /**
   * Check if storage has enough space for new data
   * @param {number} additionalBytes - Estimated additional bytes needed
   * @returns {Promise<{canSave: boolean, usage: number, quota: number}>}
   */
  async function checkStorageCapacity(additionalBytes = 0) {
    const usage = await getStorageUsage();
    const projectedUsage = usage + additionalBytes;
    return {
      canSave: projectedUsage < STORAGE_QUOTA,
      usage,
      quota: STORAGE_QUOTA,
      percentage: (usage / STORAGE_QUOTA) * 100
    };
  }

  /**
   * Estimate size of data in bytes
   */
  function estimateSize(data) {
    return new Blob([JSON.stringify(data)]).size;
  }

  /**
   * Check if a bookmark matches the current URL based on settings
   */
  function bookmarkMatchesUrl(bookmark, url) {
    const normalizedUrl = normalizeUrl(url);

    // Exact match
    if (bookmark.urlPattern === normalizedUrl) {
      return { matches: true, type: 'exact' };
    }

    // Fuzzy subdomain match
    if (matchSettings.fuzzySubdomainMatch) {
      const fuzzyUrl = normalizeUrlFuzzy(url);
      const fuzzyBookmark = normalizeUrlFuzzy(bookmark.urlPattern);
      if (fuzzyBookmark === fuzzyUrl) {
        return { matches: true, type: 'fuzzy' };
      }
    }

    // Environment group match
    if (matchSettings.useEnvironmentGroups) {
      const groupedOrigins = getGroupedOrigins(url);
      try {
        const bookmarkOrigin = getUrlOrigin(bookmark.urlPattern);
        if (groupedOrigins.includes(bookmarkOrigin)) {
          // Check if pathname also matches
          const urlPath = new URL(url).pathname;
          const bookmarkPath = new URL(bookmark.urlPattern).pathname;
          if (urlPath === bookmarkPath) {
            return { matches: true, type: 'envGroup' };
          }
        }
      } catch {
        // Invalid URL
      }
    }

    return { matches: false };
  }

  /**
   * Get bookmarks for current URL
   */
  function getBookmarksForUrl(url) {
    if (matchSettings.showAllBookmarks) {
      return bookmarks.map(b => ({
        ...b,
        matchType: bookmarkMatchesUrl(b, url).matches ? 'current' : 'other'
      }));
    }

    return bookmarks
      .map(b => {
        const match = bookmarkMatchesUrl(b, url);
        return match.matches ? { ...b, matchType: match.type } : null;
      })
      .filter(Boolean);
  }

  /**
   * Get folders for current URL
   */
  function getFoldersForUrl(url) {
    if (matchSettings.showAllBookmarks) {
      const normalizedUrl = normalizeUrl(url);
      return folders.map(f => ({
        ...f,
        matchType: f.urlPattern === normalizedUrl ? 'current' : 'other'
      }));
    }

    const normalizedUrl = normalizeUrl(url);
    const matchedFolders = [];

    for (const folder of folders) {
      // Exact match
      if (folder.urlPattern === normalizedUrl) {
        matchedFolders.push({ ...folder, matchType: 'exact' });
        continue;
      }

      // Fuzzy match
      if (matchSettings.fuzzySubdomainMatch) {
        const fuzzyUrl = normalizeUrlFuzzy(url);
        const fuzzyFolder = normalizeUrlFuzzy(folder.urlPattern);
        if (fuzzyFolder === fuzzyUrl) {
          matchedFolders.push({ ...folder, matchType: 'fuzzy' });
          continue;
        }
      }

      // Environment group match
      if (matchSettings.useEnvironmentGroups) {
        const groupedOrigins = getGroupedOrigins(url);
        try {
          const folderOrigin = getUrlOrigin(folder.urlPattern);
          if (groupedOrigins.includes(folderOrigin)) {
            const urlPath = new URL(url).pathname;
            const folderPath = new URL(folder.urlPattern).pathname;
            if (urlPath === folderPath) {
              matchedFolders.push({ ...folder, matchType: 'envGroup' });
            }
          }
        } catch {
          // Invalid URL
        }
      }
    }

    return matchedFolders;
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
    const showUrlBadge = matchSettings.showAllBookmarks && bookmark.matchType === 'other';
    const urlBadge = showUrlBadge
      ? `<span class="url-badge" title="${escapeHtml(bookmark.urlPattern)}">${escapeHtml(bookmark.urlPattern)}</span>`
      : '';

    return `
      <div class="bookmark-item" data-id="${bookmark.id}" data-type="bookmark">
        <div class="bookmark-info">
          <span class="bookmark-name">${escapeHtml(bookmark.name)}</span>
          <span class="bookmark-date">${formatDate(bookmark.updatedAt)}</span>
          ${urlBadge}
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

      // Check storage capacity before saving
      const newBookmarkSize = estimateSize(newBookmark);
      const capacity = await checkStorageCapacity(newBookmarkSize);

      if (!capacity.canSave) {
        showToast(i18n.get('errorStorageFull'), 'error');
        return;
      }

      bookmarks.push(newBookmark);
      await saveData();
      renderBookmarks();
      closeSaveDialog();
      showToast(i18n.get('toastSaved', name), 'success');

      // Show warning if storage is getting full
      if (capacity.percentage > STORAGE_WARNING_THRESHOLD * 100) {
        setTimeout(() => {
          showToast(i18n.get('storageUsage', formatBytes(capacity.usage), formatBytes(capacity.quota)), 'warning');
        }, 3500);
      }
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

    // Check storage capacity
    const newFolderSize = estimateSize(newFolder);
    const capacity = await checkStorageCapacity(newFolderSize);

    if (!capacity.canSave) {
      showToast(i18n.get('errorStorageFull'), 'error');
      return;
    }

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

        // Merge folders if present
        let newFolders = [];
        if (data.folders && Array.isArray(data.folders)) {
          const existingFolderIds = new Set(folders.map(f => f.id));
          newFolders = data.folders.filter(f => !existingFolderIds.has(f.id));
        }

        // Check storage capacity before import
        const importSize = estimateSize([...newBookmarks, ...newFolders]);
        const capacity = await checkStorageCapacity(importSize);

        if (!capacity.canSave) {
          showToast(i18n.get('errorStorageFull'), 'error');
          return;
        }

        bookmarks.push(...newBookmarks);
        folders.push(...newFolders);

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

  // ============================================
  // Environment Groups Management
  // ============================================

  /**
   * Open environment groups dialog
   */
  function openEnvGroupsDialog() {
    renderEnvGroupsList();
    elements.envGroupsDialog.classList.remove('hidden');
  }

  /**
   * Close environment groups dialog
   */
  function closeEnvGroupsDialog() {
    elements.envGroupsDialog.classList.add('hidden');
  }

  /**
   * Render environment groups list
   */
  function renderEnvGroupsList() {
    if (environmentGroups.length === 0) {
      elements.envGroupsList.innerHTML = `<p class="env-groups-empty">${i18n.get('noEnvGroups')}</p>`;
      return;
    }

    elements.envGroupsList.innerHTML = environmentGroups.map(group => `
      <div class="env-group-item" data-id="${group.id}">
        <div class="env-group-info">
          <span class="env-group-name">${escapeHtml(group.name)}</span>
          <span class="env-group-patterns-count">${i18n.get('patternsCount', group.patterns.length.toString())}</span>
        </div>
        <div class="env-group-actions">
          <button class="btn btn-small btn-edit" data-action="edit-env-group" title="${i18n.get('edit')}">
            ✏️
          </button>
          <button class="btn btn-small btn-delete" data-action="delete-env-group" title="${i18n.get('delete')}">
            🗑️
          </button>
        </div>
      </div>
    `).join('');

    // Add event listeners
    elements.envGroupsList.querySelectorAll('.env-group-item').forEach(item => {
      item.addEventListener('click', handleEnvGroupAction);
    });
  }

  /**
   * Handle environment group action
   */
  function handleEnvGroupAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    event.stopPropagation();

    const action = button.dataset.action;
    const groupItem = event.currentTarget;
    const groupId = groupItem.dataset.id;
    const group = environmentGroups.find(g => g.id === groupId);

    if (!group) return;

    switch (action) {
      case 'edit-env-group':
        openEnvGroupEditDialog(group);
        break;
      case 'delete-env-group':
        deleteEnvGroup(group);
        break;
    }
  }

  /**
   * Open environment group edit dialog
   */
  function openEnvGroupEditDialog(group = null) {
    editingEnvGroupId = group ? group.id : null;
    editingEnvPatterns = group ? [...group.patterns] : [];

    elements.envGroupEditTitle.textContent = group
      ? i18n.get('editEnvGroupTitle')
      : i18n.get('addEnvGroupTitle');
    elements.envGroupName.value = group ? group.name : '';

    renderEnvPatternsList();
    elements.envGroupEditDialog.classList.remove('hidden');
    elements.envGroupName.focus();
  }

  /**
   * Close environment group edit dialog
   */
  function closeEnvGroupEditDialog() {
    elements.envGroupEditDialog.classList.add('hidden');
    editingEnvGroupId = null;
    editingEnvPatterns = [];
    elements.envGroupName.value = '';
    elements.newEnvPattern.value = '';
  }

  /**
   * Render environment patterns list
   */
  function renderEnvPatternsList() {
    if (editingEnvPatterns.length === 0) {
      elements.envPatternsList.innerHTML = '';
      return;
    }

    elements.envPatternsList.innerHTML = editingEnvPatterns.map((pattern, index) => `
      <div class="env-pattern-item" data-index="${index}">
        <span title="${escapeHtml(pattern)}">${escapeHtml(pattern)}</span>
        <button class="btn-remove" data-action="remove-pattern">×</button>
      </div>
    `).join('');

    elements.envPatternsList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.env-pattern-item').dataset.index);
        editingEnvPatterns.splice(index, 1);
        renderEnvPatternsList();
      });
    });
  }

  /**
   * Add pattern to editing list
   */
  function addEnvPattern() {
    const pattern = elements.newEnvPattern.value.trim();
    if (!pattern) return;

    // Validate URL
    try {
      new URL(pattern);
    } catch {
      showToast(i18n.get('errorInvalidUrl'), 'error');
      return;
    }

    // Check for duplicates
    if (editingEnvPatterns.includes(pattern)) {
      showToast(i18n.get('errorDuplicatePattern'), 'warning');
      return;
    }

    editingEnvPatterns.push(pattern);
    elements.newEnvPattern.value = '';
    renderEnvPatternsList();
  }

  /**
   * Save environment group
   */
  async function saveEnvGroup() {
    const name = elements.envGroupName.value.trim();
    if (!name) {
      showToast(i18n.get('errorEnterName'), 'error');
      return;
    }

    if (editingEnvPatterns.length < 2) {
      showToast(i18n.get('errorMinPatterns'), 'error');
      return;
    }

    if (editingEnvGroupId) {
      // Update existing group
      const group = environmentGroups.find(g => g.id === editingEnvGroupId);
      if (group) {
        group.name = name;
        group.patterns = [...editingEnvPatterns];
      }
    } else {
      // Create new group
      const newGroup = {
        id: generateUUID(),
        name,
        patterns: [...editingEnvPatterns],
        createdAt: Date.now()
      };
      environmentGroups.push(newGroup);
    }

    await saveEnvironmentGroups();
    closeEnvGroupEditDialog();
    renderEnvGroupsList();
    renderBookmarks();
    showToast(i18n.get('toastEnvGroupSaved'), 'success');
  }

  /**
   * Delete environment group
   */
  async function deleteEnvGroup(group) {
    const index = environmentGroups.findIndex(g => g.id === group.id);
    if (index === -1) return;

    environmentGroups.splice(index, 1);
    await saveEnvironmentGroups();
    renderEnvGroupsList();
    renderBookmarks();
    showToast(i18n.get('toastEnvGroupDeleted', group.name), 'success');
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
    elements.includePasswords.checked = settings.includePasswords;
    elements.autoRestore.checked = settings.autoRestore;
    elements.showAllBookmarks.checked = matchSettings.showAllBookmarks;
    elements.fuzzySubdomainMatch.checked = matchSettings.fuzzySubdomainMatch;
    elements.useEnvironmentGroups.checked = matchSettings.useEnvironmentGroups;

    // Re-render bookmarks after loading settings
    renderBookmarks();

    // Settings change handlers
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

    elements.showAllBookmarks.addEventListener('change', async () => {
      matchSettings.showAllBookmarks = elements.showAllBookmarks.checked;
      await saveSettings({ showAllBookmarks: matchSettings.showAllBookmarks });
      renderBookmarks();
    });

    elements.fuzzySubdomainMatch.addEventListener('change', async () => {
      matchSettings.fuzzySubdomainMatch = elements.fuzzySubdomainMatch.checked;
      await saveSettings({ fuzzySubdomainMatch: matchSettings.fuzzySubdomainMatch });
      renderBookmarks();
    });

    elements.useEnvironmentGroups.addEventListener('change', async () => {
      matchSettings.useEnvironmentGroups = elements.useEnvironmentGroups.checked;
      await saveSettings({ useEnvironmentGroups: matchSettings.useEnvironmentGroups });
      renderBookmarks();
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

    // Environment groups event listeners
    elements.manageEnvGroupsBtn.addEventListener('click', openEnvGroupsDialog);
    elements.closeEnvGroups.addEventListener('click', closeEnvGroupsDialog);
    elements.addEnvGroupBtn.addEventListener('click', () => openEnvGroupEditDialog(null));
    elements.cancelEnvGroupEdit.addEventListener('click', closeEnvGroupEditDialog);
    elements.confirmEnvGroupEdit.addEventListener('click', saveEnvGroup);
    elements.addEnvPatternBtn.addEventListener('click', addEnvPattern);

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
    elements.envGroupName.addEventListener('keypress', e => {
      if (e.key === 'Enter') saveEnvGroup();
    });
    elements.newEnvPattern.addEventListener('keypress', e => {
      if (e.key === 'Enter') addEnvPattern();
    });

    // Close dialogs on overlay click
    [elements.saveDialog, elements.folderDialog, elements.editDialog, elements.deleteDialog,
     elements.envGroupsDialog, elements.envGroupEditDialog].forEach(dialog => {
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
