const {
  normalizeUrl,
  normalizeUrlFuzzy,
  getUrlOrigin,
  getEnvironmentGroupForUrl,
  getGroupedOrigins,
  bookmarkMatchesUrl,
  escapeHtml
} = require('../../utils');

describe('normalizeUrl', () => {
  test('removes query parameters', () => {
    expect(normalizeUrl('https://example.com/page?foo=bar'))
      .toBe('https://example.com/page');
  });

  test('removes hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section'))
      .toBe('https://example.com/page');
  });

  test('preserves pathname', () => {
    expect(normalizeUrl('https://example.com/path/to/page'))
      .toBe('https://example.com/path/to/page');
  });

  test('handles root path', () => {
    expect(normalizeUrl('https://example.com/'))
      .toBe('https://example.com/');
  });

  test('returns original string for invalid URL', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('normalizeUrlFuzzy', () => {
  test('removes numbers from subdomain', () => {
    expect(normalizeUrlFuzzy('https://hoge-111.example.com/page'))
      .toBe('https://hoge-.example.com/page');
  });

  test('removes all numbers from hostname', () => {
    expect(normalizeUrlFuzzy('https://app123.staging456.example.com/'))
      .toBe('https://app.staging.example.com/');
  });

  test('handles hostname with only numbers in subdomain', () => {
    expect(normalizeUrlFuzzy('https://123.example.com/'))
      .toBe('https://.example.com/');
  });

  test('preserves numbers in path', () => {
    expect(normalizeUrlFuzzy('https://hoge-111.example.com/page/123'))
      .toBe('https://hoge-.example.com/page/123');
  });

  test('returns original string for invalid URL', () => {
    expect(normalizeUrlFuzzy('invalid')).toBe('invalid');
  });
});

describe('getUrlOrigin', () => {
  test('extracts origin from URL', () => {
    expect(getUrlOrigin('https://example.com/path'))
      .toBe('https://example.com');
  });

  test('includes port in origin', () => {
    expect(getUrlOrigin('http://localhost:8000/path'))
      .toBe('http://localhost:8000');
  });

  test('returns original string for invalid URL', () => {
    expect(getUrlOrigin('not-a-url')).toBe('not-a-url');
  });
});

describe('getEnvironmentGroupForUrl', () => {
  const envGroups = [
    {
      id: 'group1',
      name: 'Environment A',
      patterns: [
        'https://app.example.com',
        'https://staging.example.com',
        'http://localhost:3000'
      ]
    },
    {
      id: 'group2',
      name: 'Environment B',
      patterns: [
        'https://api.other.com',
        'https://api-staging.other.com'
      ]
    }
  ];

  test('finds matching group for exact origin', () => {
    const group = getEnvironmentGroupForUrl('https://app.example.com/page', envGroups);
    expect(group).toBeDefined();
    expect(group.id).toBe('group1');
  });

  test('finds matching group for localhost', () => {
    const group = getEnvironmentGroupForUrl('http://localhost:3000/test', envGroups);
    expect(group).toBeDefined();
    expect(group.id).toBe('group1');
  });

  test('returns undefined for non-matching URL', () => {
    const group = getEnvironmentGroupForUrl('https://unknown.com/', envGroups);
    expect(group).toBeUndefined();
  });

  test('returns undefined for empty groups array', () => {
    const group = getEnvironmentGroupForUrl('https://example.com/', []);
    expect(group).toBeUndefined();
  });
});

describe('getGroupedOrigins', () => {
  const envGroups = [
    {
      id: 'group1',
      name: 'Test Group',
      patterns: [
        'https://prod.example.com',
        'https://staging.example.com',
        'http://localhost:8000'
      ]
    }
  ];

  test('returns all origins in the same group', () => {
    const origins = getGroupedOrigins('https://prod.example.com/', envGroups);
    expect(origins).toHaveLength(3);
    expect(origins).toContain('https://prod.example.com');
    expect(origins).toContain('https://staging.example.com');
    expect(origins).toContain('http://localhost:8000');
  });

  test('returns only own origin when not in any group', () => {
    const origins = getGroupedOrigins('https://other.com/page', envGroups);
    expect(origins).toEqual(['https://other.com']);
  });
});

describe('bookmarkMatchesUrl', () => {
  const envGroups = [
    {
      id: 'group1',
      name: 'Test',
      patterns: [
        'https://prod.example.com',
        'https://staging.example.com'
      ]
    }
  ];

  describe('exact match', () => {
    test('matches identical URL', () => {
      const bookmark = { urlPattern: 'https://example.com/page' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://example.com/page', settings, []);
      expect(result.matches).toBe(true);
      expect(result.type).toBe('exact');
    });

    test('matches URL with query params stripped', () => {
      const bookmark = { urlPattern: 'https://example.com/page' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://example.com/page?foo=bar', settings, []);
      expect(result.matches).toBe(true);
    });

    test('does not match different path', () => {
      const bookmark = { urlPattern: 'https://example.com/page1' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://example.com/page2', settings, []);
      expect(result.matches).toBe(false);
    });
  });

  describe('fuzzy subdomain match', () => {
    test('matches when numbers differ in subdomain', () => {
      const bookmark = { urlPattern: 'https://hoge-111.example.com/form' };
      const settings = { fuzzySubdomainMatch: true, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://hoge-222.example.com/form', settings, []);
      expect(result.matches).toBe(true);
      expect(result.type).toBe('fuzzy');
    });

    test('does not match when disabled', () => {
      const bookmark = { urlPattern: 'https://hoge-111.example.com/form' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://hoge-222.example.com/form', settings, []);
      expect(result.matches).toBe(false);
    });

    test('does not match different paths even with fuzzy', () => {
      const bookmark = { urlPattern: 'https://hoge-111.example.com/form1' };
      const settings = { fuzzySubdomainMatch: true, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://hoge-222.example.com/form2', settings, []);
      expect(result.matches).toBe(false);
    });
  });

  describe('environment group match', () => {
    test('matches URLs in same environment group with same path', () => {
      const bookmark = { urlPattern: 'https://prod.example.com/form' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: true };
      const result = bookmarkMatchesUrl(bookmark, 'https://staging.example.com/form', settings, envGroups);
      expect(result.matches).toBe(true);
      expect(result.type).toBe('envGroup');
    });

    test('does not match different paths in same group', () => {
      const bookmark = { urlPattern: 'https://prod.example.com/form1' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: true };
      const result = bookmarkMatchesUrl(bookmark, 'https://staging.example.com/form2', settings, envGroups);
      expect(result.matches).toBe(false);
    });

    test('does not match when disabled', () => {
      const bookmark = { urlPattern: 'https://prod.example.com/form' };
      const settings = { fuzzySubdomainMatch: false, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://staging.example.com/form', settings, envGroups);
      expect(result.matches).toBe(false);
    });
  });

  describe('priority order', () => {
    test('exact match takes priority over fuzzy', () => {
      const bookmark = { urlPattern: 'https://hoge-111.example.com/form' };
      const settings = { fuzzySubdomainMatch: true, useEnvironmentGroups: false };
      const result = bookmarkMatchesUrl(bookmark, 'https://hoge-111.example.com/form', settings, []);
      expect(result.matches).toBe(true);
      expect(result.type).toBe('exact');
    });
  });
});

describe('escapeHtml', () => {
  test('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('escapes ampersand', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('converts non-string to string', () => {
    expect(escapeHtml(123)).toBe('123');
  });
});
