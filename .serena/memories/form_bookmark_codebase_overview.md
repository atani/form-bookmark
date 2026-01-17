# Form Bookmark Chrome Extension - Codebase Overview

## Project Summary
A Chrome extension that saves and restores form inputs for testing purposes. Supports URL-based organization with advanced matching strategies (exact, fuzzy subdomain, environment groups), folders, export/import, and auto-restore functionality.

## Project Structure

```
form-bookmark/
├── manifest.json           # Chrome extension manifest (v3)
├── utils.js               # Shared utility functions (URL matching, helpers)
├── content.js             # Content script (form field extraction/restoration)
├── styles.css             # Popup UI styling
├── popup/
│   ├── popup.html         # Popup UI structure
│   └── popup.js           # Popup logic (data management, events)
├── icons/                 # Extension icons (16, 48, 128px)
├── _locales/
│   ├── en/messages.json   # English translations
│   └── ja/messages.json   # Japanese translations
├── tests/
│   ├── unit/utils.test.js # Utils function tests
│   └── e2e/               # E2E tests (Puppeteer-based)
└── README.md              # Project documentation
```

## Key Files & Responsibilities

### 1. manifest.json
- Chrome Manifest V3 configuration
- Permissions: storage, activeTab
- Content script runs on all URLs
- Popup: popup/popup.html
- Icons: 16, 48, 128px PNG formats

### 2. utils.js
**Shared utility functions used by both popup and content script:**

| Function | Purpose |
|----------|---------|
| `generateUUID()` | Generate unique bookmark IDs |
| `normalizeUrl(url)` | Remove query params & hash from URL |
| `normalizeUrlFuzzy(url)` | Remove numbers from hostname (e.g., `app-111.example.com` → `app-.example.com`) |
| `getUrlOrigin(url)` | Extract origin from URL |
| `getEnvironmentGroupForUrl(url, envGroups)` | Find matching environment group for a URL |
| `getGroupedOrigins(url, envGroups)` | Get all origins in same environment group |
| `bookmarkMatchesUrl(bookmark, url, settings, envGroups)` | Check if bookmark matches current URL (returns {matches, type}) |
| `escapeHtml(str)` | Prevent XSS by escaping HTML special chars |

**Module Export Pattern:**
- Universal module loader: works in both Node (tests) and browser
- `module.exports` for Node, `window.FormBookmarkUtils` for browser

### 3. content.js
**Content script running on all pages:**

**State Management:**
- Settings: `includePasswords`, `autoRestore`, `fuzzySubdomainMatch`, `useEnvironmentGroups`
- `environmentGroups` array loaded from storage

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `getFormFields(includePasswords)` | Extract all form fields from page (returns {fieldIdentifier: {type, value}}) |
| `getFieldIdentifier(element)` | Generate unique identifier: id → name → position-based fallback |
| `findElementByIdentifier(identifier)` | Locate element by stored identifier |
| `restoreFormFields(fields)` | Restore form values, trigger input/change events |
| `triggerInputEvents(element)` | Fire input/change events for React/Vue compatibility |
| `setNativeValue(element, value)` | Use native value setter for framework compatibility |
| `autoRestoreForm(bookmarks)` | Auto-restore matching bookmark on page load (most recent) |
| `normalizeUrl(url)` | Local duplicate of utils function |

**Message Listeners:**
- `getFormFields`: Extract current page form fields
- `restoreFormFields`: Restore fields from saved bookmark
- `updateSettings`: Update settings from popup

**Storage Access:**
- `chrome.storage.local`: Settings (includePasswords, autoRestore, fuzzySubdomainMatch, useEnvironmentGroups, environmentGroups)
- `chrome.storage.sync`: Bookmarks, folders, collapsedFolders (synced across devices)

### 4. popup/popup.js
**Main popup UI logic (~800 lines)**

**State Variables:**
- `currentUrl`, `currentTabId`, `currentTitle`
- `bookmarks[]`, `folders[]`, `environmentGroups[]`
- `collapsedFolders` Set (persisted)
- `matchSettings`: {showAllBookmarks, fuzzySubdomainMatch, useEnvironmentGroups}
- Edit/delete tracking: `editingBookmarkId`, `deletingBookmarkId`, `deletingFolderId`, `editingEnvGroupId`, `editingEnvPatterns`

**Key Functions - Data Management:**

| Function | Purpose |
|----------|---------|
| `loadData()` | Load bookmarks, folders, collapsedFolders from sync storage |
| `saveData()` | Save bookmarks, folders, collapsedFolders to sync storage |
| `loadSettings()` | Load settings from local storage |
| `saveSettings(settings)` | Save settings to local storage |
| `saveEnvironmentGroups()` | Save environment groups to local storage |
| `checkStorageCapacity(additionalBytes)` | Check 100KB sync storage limit (warns at 90%) |
| `estimateSize(data)` | Estimate JSON data size in bytes |

**Key Functions - URL Matching:**

| Function | Purpose |
|----------|---------|
| `bookmarkMatchesUrl(bookmark, url)` | Check bookmark match with current settings |
| `getBookmarksForUrl(url)` | Get bookmarks for current URL (respects showAllBookmarks) |
| `getFoldersForUrl(url)` | Get folders for current URL (respects matching settings) |

**Key Functions - Bookmark Operations:**

| Function | Purpose |
|----------|---------|
| `saveNewBookmark()` | Save current form fields as bookmark |
| `restoreBookmark(bookmark)` | Send message to content script to restore fields |
| `updateBookmark()` | Update bookmark name |
| `deleteItem()` | Delete bookmark or folder |

**Key Functions - Folder Operations:**

| Function | Purpose |
|----------|---------|
| `createFolder()` | Create new folder for current URL |
| `toggleFolder(folderId)` | Toggle folder collapsed state |
| `openDeleteFolderDialog(folderId)` | Delete folder (moves bookmarks to root) |

**Key Functions - Environment Groups:**

| Function | Purpose |
|----------|---------|
| `openEnvGroupsDialog()` | Show environment groups management UI |
| `openEnvGroupEditDialog(group)` | Open add/edit environment group dialog |
| `addEnvPattern()` | Add URL pattern to environment group |
| `saveEnvGroup()` | Save new or updated environment group |
| `deleteEnvGroup(group)` | Delete environment group |

**Key Functions - Import/Export:**

| Function | Purpose |
|----------|---------|
| `exportData()` | Download bookmarks/folders as JSON file |
| `handleImport(event)` | Upload and merge bookmarks from JSON file |

**Key Functions - UI Rendering:**

| Function | Purpose |
|----------|---------|
| `renderBookmarks()` | Render bookmarks/folders list to DOM |
| `renderBookmarkItem(bookmark)` | Generate bookmark item HTML |
| `renderFolderItem(folder, folderBookmarks)` | Generate folder item HTML with toggle |
| `renderEnvGroupsList()` | Render environment groups list |
| `renderEnvPatternsList()` | Render URL patterns in group editor |
| `updateFolderSelect()` | Populate folder dropdown in save dialog |

**Key Functions - Dialog Management:**
- `openSaveDialog()`, `closeSaveDialog()`
- `openFolderDialog()`, `closeFolderDialog()`
- `openEditDialog(bookmark)`, `closeEditDialog()`
- `openDeleteDialog(bookmark)`, `closeDeleteDialog()`
- `openEnvGroupEditDialog(group)`, `closeEnvGroupEditDialog()`

**Event Listeners:**
- Save button → openSaveDialog
- Add folder button → openFolderDialog
- Settings toggles → update state + re-render
- Bookmark actions (restore/edit/delete) → handleBookmarkAction
- Folder toggle → toggleFolder
- Enter key support for dialogs

### 5. popup/popup.html
**UI Structure:**
- Header: current URL display
- Actions: Save Current Form button
- Bookmarks section: list + add folder button
- Settings: 5 toggles (showAll, fuzzyMatch, envGroups, passwords, autoRestore)
  - Advanced section: manage env groups, export/import
- Dialogs:
  - Save bookmark (name + folder select)
  - Create folder (name)
  - Edit bookmark (name)
  - Delete confirmation
  - Environment groups management
  - Environment group edit (name + patterns)
- Toast notification area
- i18n enabled with `data-i18n` attributes

### 6. styles.css
**Layout:**
- 360px fixed width popup
- Min 200px height
- Dark theme: #333 text on white background

**Key Styles:**
- Primary button: #4A90D9 (blue)
- Success/restore: #27AE60 (green)
- Edit: #F39C12 (orange)
- Delete: #E74C3C (red)
- Folder: #e8f4fc background with blue theme
- Toggle switch: custom CSS animation
- Dialog overlay: rgba(0,0,0,0.5) with centered dialog
- Toast: fixed position bottom-20px, auto-hide after 3s
- Scrollbar: custom webkit styling

**Responsive Elements:**
- Folder tree with collapsible sections
- URL badges for "show all" mode
- Responsive button sizing

## Data Storage Architecture

### Chrome Storage - Sync (100KB limit)
**Synced across all user devices:**
```javascript
{
  bookmarks: [
    {
      id: "uuid",
      name: string,
      urlPattern: string (normalized),
      folderId: string | null,
      fields: {fieldIdentifier: {type, value}},
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ],
  folders: [
    {
      id: "uuid",
      name: string,
      urlPattern: string (normalized),
      createdAt: timestamp
    }
  ],
  collapsedFolders: [folderId, ...]
}
```

### Chrome Storage - Local (unlimited)
**Device-specific settings:**
```javascript
{
  includePasswords: boolean,
  autoRestore: boolean,
  showAllBookmarks: boolean,
  fuzzySubdomainMatch: boolean,
  useEnvironmentGroups: boolean,
  environmentGroups: [
    {
      id: "uuid",
      name: string,
      patterns: [url, url, ...],  // minimum 2
      createdAt: timestamp
    }
  ]
}
```

## URL Matching System

### Three Matching Strategies (in priority order)

**1. Exact Match (always active)**
```
Bookmark: https://example.com/form
URL: https://example.com/form?foo=bar
Result: MATCH ✓ (query params stripped)
```

**2. Fuzzy Subdomain Match (toggle: fuzzySubdomainMatch)**
```
Bookmark: https://app-111.example.com/form
URL: https://app-222.example.com/form
Normalized: https://app-.example.com/form (numbers removed)
Result: MATCH ✓
```

**3. Environment Group Match (toggle: useEnvironmentGroups)**
```
Group: ["https://prod.example.com", "https://staging.example.com"]
Bookmark: https://prod.example.com/form
URL: https://staging.example.com/form
Result: MATCH ✓ (same origin group + same path)
```

### URL Normalization
- **normalizeUrl**: Removes query params and hash (`?foo=bar#section` removed)
- **normalizeUrlFuzzy**: Removes ALL numbers from hostname (`app123` → `app`, `456` → empty)
- **getUrlOrigin**: Extracts origin with port (`https://example.com:8000/path` → `https://example.com:8000`)

## Form Field Handling

### Field Identification Strategy
Priority order for unique identification:
1. HTML `id` attribute → `id:inputId`
2. `name` attribute → `name:inputName`
3. Position-based → `pos:tagName[type]:index`

### Supported Field Types
```javascript
// Text-based
input[type=text|email|number|password|date|etc]
textarea

// Selection
select (single & multiple)
input[type=checkbox]
input[type=radio]

// Excluded
input[type=submit|button|reset|image]
hidden inputs without name
password fields (unless includePasswords=true)
```

### Field Restoration Process
1. Query form field by stored identifier
2. Set value using native value setter (React compatibility)
3. Trigger input + change events (Vue, Angular compatibility)
4. Handle radio buttons as group (by name)
5. Return results: {success: number, failed: number}

## Testing

### Unit Tests (tests/unit/utils.test.js)
- Tests for all utils.js functions
- 30+ test cases covering:
  - URL normalization edge cases
  - Environment group matching logic
  - Bookmark URL matching priority
  - HTML escaping security
  - Error handling

### E2E Tests (tests/e2e/extension.test.js)
- Puppeteer-based browser testing
- Extension context testing (optional in CI)

## Internationalization (i18n)

### Supported Languages
- Japanese (ja): default locale
- English (en): full translation

### Translation Keys
- UI text: headerTitle, saveCurrentForm, etc.
- Placeholders: bookmarkNamePlaceholder, envPatternPlaceholder, etc.
- Messages with substitutions: deleteConfirmMessage ($NAME$), toastImported ($COUNT$), etc.
- Error/warning messages

### Implementation
- `chrome.i18n.getMessage(key, substitutions)` for runtime lookup
- `data-i18n` attributes for static HTML text
- `data-i18n-placeholder` for input placeholders
- `data-i18n-title` for element titles

## Feature Map for Planned Enhancements

### Currently Implemented ✓
- Save/restore bookmarks
- Folder organization
- Exact URL matching
- Fuzzy subdomain matching (ignore numbers)
- Environment groups
- Auto-restore on page load
- Password field inclusion toggle
- Export/import functionality
- Storage quota management (100KB)
- Multi-language support
- Chrome sync

### Planned Features (from branch: feature/url-matching-extensions)
1. **Add bookmarks to groups** - Associate bookmarks with environment groups
2. **Flexible subdomain matching** - Beyond just number-ignore (regex patterns?)
3. **Add current URL to environment groups** - Quick-add feature from popup

## Development Tools & Scripts

```bash
npm run test         # Run all tests
npm run test:unit    # Run unit tests only
npm run test:e2e     # Run E2E tests
npm run test:watch   # Watch mode
```

## Git Workflow
- Main branch: production-ready code
- Feature branch: `feature/url-matching-extensions` (current work)
- Recent commits related to E2E test CI configuration

## Security Considerations

1. **XSS Prevention**: All user input escaped with `escapeHtml()`
2. **Password Handling**: Opt-in only, default excluded
3. **Content Script Isolation**: Message-passing for form access
4. **Storage Security**: Relies on Chrome's built-in storage encryption
5. **No External APIs**: All functionality self-contained

## Performance Optimizations

1. **Auto-restore Delay**: 500ms delay for dynamic forms to load
2. **Storage Limits**: 100KB quota with 90% warning threshold
3. **DOM Query Efficiency**: Batch operations where possible
4. **Event Delegation**: Single listener per parent element
5. **Debounced Rendering**: Combined bookmark + folder rendering
