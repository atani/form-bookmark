// Form Bookmark - Utility Functions
// Shared logic for URL matching and environment groups

(function(exports) {
  'use strict';

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
   * Get URL origin
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
   * @param {string} url - The URL to find a group for
   * @param {Array} environmentGroups - Array of environment group objects
   * @returns {Object|undefined} The matching environment group or undefined
   */
  function getEnvironmentGroupForUrl(url, environmentGroups) {
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
   * @param {string} url - The URL to find grouped origins for
   * @param {Array} environmentGroups - Array of environment group objects
   * @returns {Array} Array of origin strings
   */
  function getGroupedOrigins(url, environmentGroups) {
    const group = getEnvironmentGroupForUrl(url, environmentGroups);
    if (!group) return [getUrlOrigin(url)];
    return group.patterns.map(p => getUrlOrigin(p));
  }

  /**
   * Check if a bookmark matches the given URL based on settings
   * @param {Object} bookmark - The bookmark object with urlPattern
   * @param {string} url - The URL to match against
   * @param {Object} settings - Settings object with fuzzySubdomainMatch and useEnvironmentGroups
   * @param {Array} environmentGroups - Array of environment group objects
   * @returns {Object} { matches: boolean, type?: string }
   */
  function bookmarkMatchesUrl(bookmark, url, settings, environmentGroups) {
    const normalizedUrl = normalizeUrl(url);

    // Exact match
    if (bookmark.urlPattern === normalizedUrl) {
      return { matches: true, type: 'exact' };
    }

    // Fuzzy subdomain match
    if (settings.fuzzySubdomainMatch) {
      const fuzzyUrl = normalizeUrlFuzzy(url);
      const fuzzyBookmark = normalizeUrlFuzzy(bookmark.urlPattern);
      if (fuzzyBookmark === fuzzyUrl) {
        return { matches: true, type: 'fuzzy' };
      }
    }

    // Environment group match
    if (settings.useEnvironmentGroups && environmentGroups) {
      const groupedOrigins = getGroupedOrigins(url, environmentGroups);
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
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(str).replace(/[&<>"']/g, c => escapeMap[c]);
  }

  // Export functions
  exports.generateUUID = generateUUID;
  exports.normalizeUrl = normalizeUrl;
  exports.normalizeUrlFuzzy = normalizeUrlFuzzy;
  exports.getUrlOrigin = getUrlOrigin;
  exports.getEnvironmentGroupForUrl = getEnvironmentGroupForUrl;
  exports.getGroupedOrigins = getGroupedOrigins;
  exports.bookmarkMatchesUrl = bookmarkMatchesUrl;
  exports.escapeHtml = escapeHtml;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.FormBookmarkUtils = {}));
