import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import {
  urlToSafeFilename,
  validateMarkdownContent,
  contentHasChanged,
  loadManifest,
  saveManifest,
  saveMarkdownFile,
  cleanupOldFiles,
  discoverSitemapAndBaseUrl,
  discoverClaudeCodePages,
  fetchMarkdownContent,
  fetchChangelog,
} from "./fetch_claude_docs";

// Test directory setup
const TEST_DIR = join(import.meta.dir, "..", "test-temp");
const TEST_DOCS_DIR = join(TEST_DIR, "docs");

beforeEach(() => {
  // Clean up and create test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DOCS_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("urlToSafeFilename", () => {
  test("converts basic path to filename (old format)", () => {
    expect(urlToSafeFilename("/en/docs/claude-code/setup")).toBe("setup.md");
  });

  test("converts basic path to filename (new format)", () => {
    expect(urlToSafeFilename("/docs/en/setup")).toBe("setup.md");
  });

  test("converts path with subdirectory using double underscores (old)", () => {
    expect(urlToSafeFilename("/en/docs/claude-code/sdk/migration-guide")).toBe("sdk__migration-guide.md");
  });

  test("converts path with subdirectory using double underscores (new)", () => {
    expect(urlToSafeFilename("/docs/en/sdk/migration-guide")).toBe("sdk__migration-guide.md");
  });

  test("handles path without prefix", () => {
    expect(urlToSafeFilename("hooks")).toBe("hooks.md");
  });

  test("handles path that already ends with .md", () => {
    expect(urlToSafeFilename("/en/docs/claude-code/setup.md")).toBe("setup.md");
  });

  test("handles /docs/claude-code/ prefix", () => {
    expect(urlToSafeFilename("/docs/claude-code/overview")).toBe("overview.md");
  });

  test("handles /claude-code/ prefix", () => {
    expect(urlToSafeFilename("/claude-code/quickstart")).toBe("quickstart.md");
  });

  test("handles deeply nested paths (old format)", () => {
    expect(urlToSafeFilename("/en/docs/claude-code/parent/child/grandchild")).toBe("parent__child__grandchild.md");
  });

  test("handles deeply nested paths (new format)", () => {
    expect(urlToSafeFilename("/docs/en/parent/child/grandchild")).toBe("parent__child__grandchild.md");
  });

  test("handles path with multiple claude-code occurrences", () => {
    const result = urlToSafeFilename("/claude-code/docs/claude-code/test");
    expect(result).toBe("test.md");
  });

  test("handles new format full URL", () => {
    const result = urlToSafeFilename("/docs/en/overview");
    expect(result).toBe("overview.md");
  });
});

describe("validateMarkdownContent", () => {
  test("validates correct markdown content", () => {
    const validContent = `# Title

## Section

Some text with **bold** and *italic*.

- List item 1
- List item 2

\`\`\`javascript
console.log("code");
\`\`\`

Documentation about installation and usage.`;

    expect(() => validateMarkdownContent(validContent, "test.md")).not.toThrow();
  });

  test("throws on empty content", () => {
    expect(() => validateMarkdownContent("", "test.md")).toThrow("Received HTML instead of markdown");
  });

  test("throws on HTML content", () => {
    const htmlContent = "<!DOCTYPE html><html><body>Not markdown</body></html>";
    expect(() => validateMarkdownContent(htmlContent, "test.md")).toThrow("Received HTML instead of markdown");
  });

  test("throws on content with <html tag", () => {
    const htmlContent = "Some text <html> more text";
    expect(() => validateMarkdownContent(htmlContent, "test.md")).toThrow("Received HTML instead of markdown");
  });

  test("throws on content that is too short", () => {
    const shortContent = "Too short";
    expect(() => validateMarkdownContent(shortContent, "test.md")).toThrow("Content too short");
  });

  test("throws on content without markdown indicators", () => {
    const plainText = "This is just plain text without any markdown formatting at all. ".repeat(10);
    expect(() => validateMarkdownContent(plainText, "test.md")).toThrow("doesn't appear to be markdown");
  });

  test("warns on content without documentation patterns", () => {
    const content = `# Test

## Another section

- Item 1
- Item 2

Some text here.`;

    // Should not throw but might log warning
    expect(() => validateMarkdownContent(content, "test.md")).not.toThrow();
  });
});

describe("contentHasChanged", () => {
  test("returns true when content is different", () => {
    const content1 = "Content version 1";
    const content2 = "Content version 2";
    const hash1 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty string hash

    expect(contentHasChanged(content1, hash1)).toBe(true);
  });

  test("returns false when content is the same", () => {
    const content = "Same content";
    // Calculate actual hash for this content
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

    expect(contentHasChanged(content, hash)).toBe(false);
  });

  test("returns true for empty old hash", () => {
    const content = "New content";
    expect(contentHasChanged(content, "")).toBe(true);
  });
});

describe("loadManifest", () => {
  test("loads existing manifest file", async () => {
    const manifest = {
      files: {
        "test.md": {
          original_url: "https://example.com/test",
          hash: "abc123",
          last_updated: "2024-01-01T00:00:00.000Z"
        }
      },
      last_updated: "2024-01-01T00:00:00.000Z"
    };

    writeFileSync(
      join(TEST_DOCS_DIR, "docs_manifest.json"),
      JSON.stringify(manifest)
    );

    const loaded = await loadManifest(TEST_DOCS_DIR);
    expect(loaded.files["test.md"]).toBeDefined();
    expect(loaded.files["test.md"].hash).toBe("abc123");
  });

  test("returns empty manifest when file doesn't exist", async () => {
    const loaded = await loadManifest(TEST_DOCS_DIR);
    expect(loaded.files).toEqual({});
    expect(loaded.last_updated).toBeUndefined();
  });

  test("returns empty manifest when file is corrupted", async () => {
    writeFileSync(
      join(TEST_DOCS_DIR, "docs_manifest.json"),
      "{ invalid json"
    );

    const loaded = await loadManifest(TEST_DOCS_DIR);
    expect(loaded.files).toEqual({});
  });

  test("initializes files object if missing", async () => {
    writeFileSync(
      join(TEST_DOCS_DIR, "docs_manifest.json"),
      JSON.stringify({ last_updated: "2024-01-01T00:00:00.000Z" })
    );

    const loaded = await loadManifest(TEST_DOCS_DIR);
    expect(loaded.files).toEqual({});
  });
});

describe("saveManifest", () => {
  test("saves manifest with metadata", async () => {
    const manifest: any = {
      files: {
        "test.md": {
          original_url: "https://example.com/test",
          hash: "abc123",
          last_updated: "2024-01-01T00:00:00.000Z"
        }
      }
    };

    await saveManifest(TEST_DOCS_DIR, manifest);

    const saved = JSON.parse(
      readFileSync(join(TEST_DOCS_DIR, "docs_manifest.json"), "utf-8")
    );

    expect(saved.files["test.md"]).toBeDefined();
    expect(saved.last_updated).toBeDefined();
    expect(saved.base_url).toBeDefined();
    expect(saved.github_repository).toBeDefined();
    expect(saved.description).toBeDefined();
  });

  test("uses environment variables for repository metadata", async () => {
    const originalRepo = process.env.GITHUB_REPOSITORY;
    const originalRef = process.env.GITHUB_REF_NAME;

    process.env.GITHUB_REPOSITORY = "test-owner/test-repo";
    process.env.GITHUB_REF_NAME = "test-branch";

    const manifest: any = { files: {} };
    await saveManifest(TEST_DOCS_DIR, manifest);

    const saved = JSON.parse(
      readFileSync(join(TEST_DOCS_DIR, "docs_manifest.json"), "utf-8")
    );

    expect(saved.github_repository).toBe("test-owner/test-repo");
    expect(saved.github_ref).toBe("test-branch");
    expect(saved.base_url).toContain("test-owner/test-repo");
    expect(saved.base_url).toContain("test-branch");

    // Restore environment
    if (originalRepo) process.env.GITHUB_REPOSITORY = originalRepo;
    else delete process.env.GITHUB_REPOSITORY;
    if (originalRef) process.env.GITHUB_REF_NAME = originalRef;
    else delete process.env.GITHUB_REF_NAME;
  });

  test("validates repository name format", async () => {
    const originalRepo = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = "invalid-repo-name";

    const manifest: any = { files: {} };
    await saveManifest(TEST_DOCS_DIR, manifest);

    const saved = JSON.parse(
      readFileSync(join(TEST_DOCS_DIR, "docs_manifest.json"), "utf-8")
    );

    expect(saved.github_repository).toBe("ericbuess/claude-code-docs");

    if (originalRepo) process.env.GITHUB_REPOSITORY = originalRepo;
    else delete process.env.GITHUB_REPOSITORY;
  });

  test("validates ref name format", async () => {
    const originalRef = process.env.GITHUB_REF_NAME;
    process.env.GITHUB_REF_NAME = "invalid@ref#name";

    const manifest: any = { files: {} };
    await saveManifest(TEST_DOCS_DIR, manifest);

    const saved = JSON.parse(
      readFileSync(join(TEST_DOCS_DIR, "docs_manifest.json"), "utf-8")
    );

    expect(saved.github_ref).toBe("main");

    if (originalRef) process.env.GITHUB_REF_NAME = originalRef;
    else delete process.env.GITHUB_REF_NAME;
  });
});

describe("saveMarkdownFile", () => {
  test("saves file and returns hash", async () => {
    const content = "# Test Content\n\nSome markdown.";
    const hash = await saveMarkdownFile(TEST_DOCS_DIR, "test.md", content);

    expect(existsSync(join(TEST_DOCS_DIR, "test.md"))).toBe(true);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // SHA-256 hex length

    const savedContent = readFileSync(join(TEST_DOCS_DIR, "test.md"), "utf-8");
    expect(savedContent).toBe(content);
  });

  test("throws error when directory doesn't exist", async () => {
    const invalidDir = join(TEST_DIR, "nonexistent");
    await expect(
      saveMarkdownFile(invalidDir, "test.md", "content")
    ).rejects.toThrow();
  });
});

describe("cleanupOldFiles", () => {
  test("removes obsolete files", async () => {
    const manifest: any = {
      files: {
        "old.md": { hash: "123", last_updated: "2024-01-01T00:00:00.000Z" },
        "keep.md": { hash: "456", last_updated: "2024-01-01T00:00:00.000Z" }
      }
    };

    writeFileSync(join(TEST_DOCS_DIR, "old.md"), "old content");
    writeFileSync(join(TEST_DOCS_DIR, "keep.md"), "keep content");

    const currentFiles = new Set(["keep.md"]);
    await cleanupOldFiles(TEST_DOCS_DIR, currentFiles, manifest);

    expect(existsSync(join(TEST_DOCS_DIR, "old.md"))).toBe(false);
    expect(existsSync(join(TEST_DOCS_DIR, "keep.md"))).toBe(true);
  });

  test("doesn't remove manifest file", async () => {
    const manifest: any = {
      files: {
        "docs_manifest.json": { hash: "123", last_updated: "2024-01-01T00:00:00.000Z" }
      }
    };

    writeFileSync(join(TEST_DOCS_DIR, "docs_manifest.json"), "{}");

    const currentFiles = new Set<string>([]);
    await cleanupOldFiles(TEST_DOCS_DIR, currentFiles, manifest);

    expect(existsSync(join(TEST_DOCS_DIR, "docs_manifest.json"))).toBe(true);
  });

  test("handles files that don't exist", async () => {
    const manifest: any = {
      files: {
        "nonexistent.md": { hash: "123", last_updated: "2024-01-01T00:00:00.000Z" }
      }
    };

    const currentFiles = new Set<string>([]);

    // Should not throw
    await expect(
      cleanupOldFiles(TEST_DOCS_DIR, currentFiles, manifest)
    ).resolves.toBeUndefined();
  });
});

describe("discoverSitemapAndBaseUrl", () => {
  test("discovers sitemap and extracts base URL", async () => {
    const mockFetch = mock(async (url: string) => {
      if (url.includes("sitemap")) {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
            <urlset>
              <url><loc>https://docs.anthropic.com/en/docs/claude-code/overview</loc></url>
            </urlset>`
        };
      }
      return { ok: false };
    });

    global.fetch = mockFetch as any;

    const result = await discoverSitemapAndBaseUrl();

    expect(result.sitemapUrl).toBeDefined();
    expect(result.baseUrl).toBe("https://docs.anthropic.com");
  });

  test("tries multiple sitemap URLs", async () => {
    let attemptCount = 0;
    const mockFetch = mock(async (url: string) => {
      attemptCount++;
      // First URL is now code.claude.com, second is docs.anthropic.com, third is sitemap_index
      if (attemptCount === 3 && url.includes("sitemap_index")) {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
            <urlset>
              <url><loc>https://docs.anthropic.com/en/docs/test</loc></url>
            </urlset>`
        };
      }
      return { ok: false };
    });

    global.fetch = mockFetch as any;

    const result = await discoverSitemapAndBaseUrl();
    expect(attemptCount).toBe(3);
    expect(result.baseUrl).toBeDefined();
  });

  test("throws when no valid sitemap found", async () => {
    const mockFetch = mock(async () => ({ ok: false }));
    global.fetch = mockFetch as any;

    await expect(discoverSitemapAndBaseUrl()).rejects.toThrow("Could not find a valid sitemap");
  });

  test("handles sitemap with no URLs", async () => {
    const mockFetch = mock(async (url: string) => {
      if (url.includes("sitemap")) {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
            <urlset>
            </urlset>`
        };
      }
      return { ok: false };
    });

    global.fetch = mockFetch as any;

    await expect(discoverSitemapAndBaseUrl()).rejects.toThrow("Could not find a valid sitemap");
  });

  test("handles fetch errors gracefully", async () => {
    let attemptCount = 0;
    const mockFetch = mock(async (url: string) => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error("Network error");
      }
      return {
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <urlset>
            <url><loc>https://docs.anthropic.com/en/docs/test</loc></url>
          </urlset>`
      };
    });

    global.fetch = mockFetch as any;

    const result = await discoverSitemapAndBaseUrl();
    expect(result.baseUrl).toBeDefined();
    expect(attemptCount).toBe(3);
  });
});

describe("discoverClaudeCodePages", () => {
  test("discovers and filters Claude Code pages", async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/overview</loc></url>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/setup</loc></url>
        <url><loc>https://docs.anthropic.com/en/docs/other-section/page</loc></url>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/tool-use/excluded</loc></url>
      </urlset>`;

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => sitemapXml
    }));

    global.fetch = mockFetch as any;

    const pages = await discoverClaudeCodePages("https://example.com/sitemap.xml");

    expect(pages).toContain("/en/docs/claude-code/overview");
    expect(pages).toContain("/en/docs/claude-code/setup");
    expect(pages).not.toContain("/en/docs/other-section/page");
    expect(pages).not.toContain("/en/docs/claude-code/tool-use/excluded");
  });

  test("handles .html URLs", async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/overview.html</loc></url>
      </urlset>`;

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => sitemapXml
    }));

    global.fetch = mockFetch as any;

    const pages = await discoverClaudeCodePages("https://example.com/sitemap.xml");
    expect(pages).toContain("/en/docs/claude-code/overview");
  });

  test("handles trailing slashes", async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/overview/</loc></url>
      </urlset>`;

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => sitemapXml
    }));

    global.fetch = mockFetch as any;

    const pages = await discoverClaudeCodePages("https://example.com/sitemap.xml");
    expect(pages).toContain("/en/docs/claude-code/overview");
  });

  test("falls back to essential pages on error", async () => {
    const mockFetch = mock(async () => ({
      ok: false
    }));

    global.fetch = mockFetch as any;

    const pages = await discoverClaudeCodePages("https://example.com/sitemap.xml");

    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toContain("/en/docs/claude-code/overview");
    expect(pages).toContain("/en/docs/claude-code/setup");
  });

  test("removes duplicates and sorts pages", async () => {
    const sitemapXml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/zebra</loc></url>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/alpha</loc></url>
        <url><loc>https://docs.anthropic.com/en/docs/claude-code/zebra</loc></url>
      </urlset>`;

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => sitemapXml
    }));

    global.fetch = mockFetch as any;

    const pages = await discoverClaudeCodePages("https://example.com/sitemap.xml");

    expect(pages.length).toBe(2); // Duplicates removed
    expect(pages[0]).toBe("/en/docs/claude-code/alpha"); // Sorted
  });
});

describe("fetchMarkdownContent", () => {
  test("fetches and validates markdown content", async () => {
    const validMarkdown = `# Test Documentation

## Section 1

This is installation documentation with code examples.

\`\`\`bash
npm install
\`\`\`

More usage information.`;

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => validMarkdown,
      status: 200,
      headers: new Map()
    }));

    global.fetch = mockFetch as any;

    const result = await fetchMarkdownContent("/en/docs/claude-code/test", "https://example.com");

    expect(result.filename).toBe("test.md");
    expect(result.content).toBe(validMarkdown);
  });

  test("handles rate limiting with retry", async () => {
    let attemptCount = 0;
    const validMarkdown = `# Valid Markdown

## Installation Guide

This is a comprehensive installation guide with all the details you need.

\`\`\`bash
npm install
\`\`\`

Additional configuration and usage information here.`;

    const mockFetch = mock(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Map([["Retry-After", "1"]])
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => validMarkdown,
        headers: new Map()
      };
    });

    global.fetch = mockFetch as any;

    const result = await fetchMarkdownContent("/en/docs/claude-code/test", "https://example.com");
    expect(attemptCount).toBe(2);
    expect(result.content).toContain("Valid Markdown");
  }, 10000);

  test("retries on failure", async () => {
    let attemptCount = 0;
    const validMarkdown = `# Documentation Guide

## Installation Section

This is a comprehensive installation guide with configuration details.

\`\`\`bash
npm install package
\`\`\`

More usage and API examples here with claude and code keywords.`;

    const mockFetch = mock(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return { ok: false, status: 500 };
      }
      return {
        ok: true,
        status: 200,
        text: async () => validMarkdown,
        headers: new Map()
      };
    });

    global.fetch = mockFetch as any;

    const result = await fetchMarkdownContent("/en/docs/claude-code/test", "https://example.com");
    expect(attemptCount).toBe(2);
  }, 10000);

  test("throws after max retries", async () => {
    const mockFetch = mock(async () => ({
      ok: false,
      status: 500
    }));

    global.fetch = mockFetch as any;

    await expect(
      fetchMarkdownContent("/en/docs/claude-code/test", "https://example.com")
    ).rejects.toThrow("Failed to fetch");
  });

  test("validates fetched content", async () => {
    const mockFetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "Short", // Too short
      headers: new Map()
    }));

    global.fetch = mockFetch as any;

    await expect(
      fetchMarkdownContent("/en/docs/claude-code/test", "https://example.com")
    ).rejects.toThrow();
  });
});

describe("fetchChangelog", () => {
  test("fetches changelog from GitHub", async () => {
    const changelogContent = `# Changelog

## v1.0.0

- Initial release
- Added feature A
- Fixed bug B`;

    const mockFetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => changelogContent,
      headers: new Map()
    }));

    global.fetch = mockFetch as any;

    const result = await fetchChangelog();

    expect(result.filename).toBe("changelog.md");
    expect(result.content).toContain("Claude Code Changelog");
    expect(result.content).toContain("Source");
    expect(result.content).toContain(changelogContent);
  });

  test("handles rate limiting", async () => {
    let attemptCount = 0;
    const changelogContent = `# Changelog

## v1.0.0

- Initial release with core features
- Added authentication system
- Implemented API endpoints
- Added comprehensive documentation`;

    const mockFetch = mock(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Map([["Retry-After", "1"]])
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => changelogContent,
        headers: new Map()
      };
    });

    global.fetch = mockFetch as any;

    const result = await fetchChangelog();
    expect(attemptCount).toBe(2);
    expect(result.content).toContain("Changelog");
  }, 10000);

  test("accepts short changelog because header is added", async () => {
    // The header is ~257 chars, so even very short content will pass validation
    const mockFetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "# v1.0", // Short content that becomes >100 chars with header
      headers: new Map()
    }));

    global.fetch = mockFetch as any;

    const result = await fetchChangelog();
    expect(result.content.length).toBeGreaterThan(100);
    expect(result.content).toContain("Claude Code Changelog");
  });

  test("throws after max retries", async () => {
    const mockFetch = mock(async () => ({
      ok: false,
      status: 500
    }));

    global.fetch = mockFetch as any;

    await expect(fetchChangelog()).rejects.toThrow("Failed to fetch changelog");
  }, 10000);
});
