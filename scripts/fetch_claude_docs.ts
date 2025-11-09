#!/usr/bin/env bun
/**
 * Improved Claude Code documentation fetcher with better robustness.
 * TypeScript version using Bun runtime.
 */

import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

// Configuration
const SITEMAP_URLS = [
  "https://code.claude.com/docs/sitemap.xml",
  "https://docs.anthropic.com/sitemap.xml",
  "https://docs.anthropic.com/sitemap_index.xml",
  "https://anthropic.com/sitemap.xml"
];

const MANIFEST_FILE = "docs_manifest.json";

// Headers to bypass caching and identify the script
const HEADERS = {
  'User-Agent': 'Claude-Code-Docs-Fetcher/3.0-TS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // milliseconds
const MAX_RETRY_DELAY = 30000; // milliseconds
const RATE_LIMIT_DELAY = 500; // milliseconds

interface ManifestFile {
  original_url: string;
  original_md_url?: string;
  original_raw_url?: string;
  hash: string;
  last_updated: string;
  source?: string;
}

interface Manifest {
  files: Record<string, ManifestFile>;
  last_updated?: string;
  base_url?: string;
  github_repository?: string;
  github_ref?: string;
  description?: string;
  fetch_metadata?: {
    last_fetch_completed: string;
    fetch_duration_seconds: number;
    total_pages_discovered: number;
    pages_fetched_successfully: number;
    pages_failed: number;
    failed_pages: string[];
    sitemap_url: string | null;
    base_url: string;
    total_files: number;
    fetch_tool_version: string;
  };
}

// Logging utilities
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warning: (msg: string) => console.warn(`[WARNING] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`)
};

/**
 * Load the manifest of previously fetched files.
 */
export async function loadManifest(docsDir: string): Promise<Manifest> {
  const manifestPath = join(docsDir, MANIFEST_FILE);
  if (existsSync(manifestPath)) {
    try {
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      if (!manifest.files) {
        manifest.files = {};
      }
      return manifest;
    } catch (e) {
      log.warning(`Failed to load manifest: ${e}`);
    }
  }
  return { files: {}, last_updated: undefined };
}

/**
 * Save the manifest of fetched files.
 */
export async function saveManifest(docsDir: string, manifest: Manifest): Promise<void> {
  const manifestPath = join(docsDir, MANIFEST_FILE);
  manifest.last_updated = new Date().toISOString();

  // Get GitHub repository from environment or use default
  const githubRepo = process.env.GITHUB_REPOSITORY || 'greenstevester/claude-code-docs';
  const githubRef = process.env.GITHUB_REF_NAME || 'main';

  // Validate repository name format (owner/repo)
  if (!/^[\w.-]+\/[\w.-]+$/.test(githubRepo)) {
    log.warning(`Invalid repository format: ${githubRepo}, using default`);
    manifest.github_repository = 'greenstevester/claude-code-docs';
  } else {
    manifest.github_repository = githubRepo;
  }

  // Validate branch/ref name
  if (!/^[\w.-]+$/.test(githubRef)) {
    log.warning(`Invalid ref format: ${githubRef}, using default`);
    manifest.github_ref = 'main';
  } else {
    manifest.github_ref = githubRef;
  }

  manifest.base_url = `https://raw.githubusercontent.com/${manifest.github_repository}/${manifest.github_ref}/docs/`;
  manifest.description = "Claude Code documentation manifest. Keys are filenames, append to base_url for full URL.";

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Convert a URL path to a safe filename.
 */
export function urlToSafeFilename(urlPath: string): string {
  // Remove any known prefix patterns (old and new formats)
  const prefixes = [
    '/docs/en/',           // New format: https://code.claude.com/docs/en/overview
    '/en/docs/claude-code/', // Old format
    '/docs/claude-code/',
    '/claude-code/'
  ];
  let path = urlPath;

  for (const prefix of prefixes) {
    if (urlPath.includes(prefix)) {
      path = urlPath.split(prefix).pop()!;
      break;
    }
  }

  // If no known prefix, take everything after the last occurrence of 'claude-code/' or 'docs/en/'
  if (path === urlPath) {
    if (urlPath.includes('claude-code/')) {
      path = urlPath.split('claude-code/').pop()!;
    } else if (urlPath.includes('/docs/en/')) {
      path = urlPath.split('/docs/en/').pop()!;
    }
  }

  // If no subdirectories, just use the filename
  if (!path.includes('/')) {
    return path.endsWith('.md') ? path : `${path}.md`;
  }

  // For subdirectories, replace slashes with double underscores
  let safeName = path.replace(/\//g, '__');
  if (!safeName.endsWith('.md')) {
    safeName += '.md';
  }
  return safeName;
}

/**
 * Discover the sitemap URL and extract the base URL from it.
 */
export async function discoverSitemapAndBaseUrl(): Promise<{ sitemapUrl: string; baseUrl: string }> {
  for (const sitemapUrl of SITEMAP_URLS) {
    try {
      log.info(`Trying sitemap: ${sitemapUrl}`);
      const response = await fetch(sitemapUrl, { headers: HEADERS });

      if (response.ok) {
        const xml = await response.text();

        // Simple XML parsing - extract first URL
        const urlMatch = xml.match(/<loc>(https?:\/\/[^<]+)<\/loc>/);
        if (urlMatch) {
          const firstUrl = urlMatch[1];
          const url = new URL(firstUrl);
          const baseUrl = `${url.protocol}//${url.host}`;
          log.info(`Found sitemap at ${sitemapUrl}, base URL: ${baseUrl}`);
          return { sitemapUrl, baseUrl };
        }
      }
    } catch (e) {
      log.warning(`Failed to fetch ${sitemapUrl}: ${e}`);
      continue;
    }
  }

  throw new Error("Could not find a valid sitemap");
}

/**
 * Dynamically discover all Claude Code documentation pages from the sitemap.
 */
export async function discoverClaudeCodePages(sitemapUrl: string): Promise<string[]> {
  log.info("Discovering documentation pages from sitemap...");

  try {
    const response = await fetch(sitemapUrl, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();

    // Extract all URLs from sitemap using regex
    const urlMatches = xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g);
    const urls = Array.from(urlMatches, match => match[1]);

    log.info(`Found ${urls.length} total URLs in sitemap`);

    // Filter for ENGLISH Claude Code documentation pages only
    const claudeCodePages: string[] = [];
    // Support both old and new URL patterns
    const englishPatterns = [
      '/docs/en/',            // New format: https://code.claude.com/docs/en/overview
      '/en/docs/claude-code/' // Old format (kept for backward compatibility)
    ];

    for (const url of urls) {
      // Check if URL matches English pattern specifically
      if (englishPatterns.some(pattern => url.includes(pattern))) {
        const urlObj = new URL(url);
        let path = urlObj.pathname;

        // Remove file extension
        if (path.endsWith('.html')) {
          path = path.slice(0, -5);
        } else if (path.endsWith('/')) {
          path = path.slice(0, -1);
        }

        // Skip certain types of pages
        const skipPatterns = ['/tool-use/', '/examples/', '/legacy/', '/api/', '/reference/'];
        if (!skipPatterns.some(skip => path.includes(skip))) {
          claudeCodePages.push(path);
        }
      }
    }

    // Remove duplicates and sort
    const uniquePages = Array.from(new Set(claudeCodePages)).sort();
    log.info(`Discovered ${uniquePages.length} Claude Code documentation pages`);

    return uniquePages;
  } catch (e) {
    log.error(`Failed to discover pages from sitemap: ${e}`);
    log.warning("Falling back to essential pages...");

    // Fallback list
    return [
      "/en/docs/claude-code/overview",
      "/en/docs/claude-code/setup",
      "/en/docs/claude-code/quickstart",
      "/en/docs/claude-code/memory",
      "/en/docs/claude-code/common-workflows",
      "/en/docs/claude-code/ide-integrations",
      "/en/docs/claude-code/mcp",
      "/en/docs/claude-code/github-actions",
      "/en/docs/claude-code/sdk",
      "/en/docs/claude-code/troubleshooting",
      "/en/docs/claude-code/security",
      "/en/docs/claude-code/settings",
      "/en/docs/claude-code/hooks",
      "/en/docs/claude-code/costs",
      "/en/docs/claude-code/monitoring-usage",
    ];
  }
}

/**
 * Validate markdown content.
 */
export function validateMarkdownContent(content: string, filename: string): void {
  // Check for HTML content
  if (!content || content.startsWith('<!DOCTYPE') || content.slice(0, 100).includes('<html')) {
    throw new Error("Received HTML instead of markdown");
  }

  // Check minimum length
  if (content.trim().length < 50) {
    throw new Error(`Content too short (${content.length} bytes)`);
  }

  // Check for common markdown elements
  const lines = content.split('\n');
  const markdownIndicators = ['# ', '## ', '### ', '```', '- ', '* ', '1. ', '[', '**', '_', '> '];

  let indicatorCount = 0;
  for (const line of lines.slice(0, 50)) {
    for (const indicator of markdownIndicators) {
      if (line.trim().startsWith(indicator) || line.includes(indicator)) {
        indicatorCount++;
        break;
      }
    }
  }

  // Require at least some markdown formatting
  if (indicatorCount < 3) {
    throw new Error(`Content doesn't appear to be markdown (only ${indicatorCount} markdown indicators found)`);
  }

  // Check for common documentation patterns
  const docPatterns = ['installation', 'usage', 'example', 'api', 'configuration', 'claude', 'code'];
  const contentLower = content.toLowerCase();
  const patternFound = docPatterns.some(pattern => contentLower.includes(pattern));

  if (!patternFound) {
    log.warning(`Content for ${filename} doesn't contain expected documentation patterns`);
  }
}

/**
 * Fetch markdown content with retry logic.
 */
export async function fetchMarkdownContent(path: string, baseUrl: string): Promise<{ filename: string; content: string }> {
  const markdownUrl = `${baseUrl}${path}.md`;
  const filename = urlToSafeFilename(path);

  log.info(`Fetching: ${markdownUrl} -> ${filename}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(markdownUrl, { headers: HEADERS });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        log.warning(`Rate limited. Waiting ${retryAfter} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();
      validateMarkdownContent(content, filename);

      log.info(`Successfully fetched and validated ${filename} (${content.length} bytes)`);
      return { filename, content };
    } catch (e) {
      log.warning(`Attempt ${attempt + 1}/${MAX_RETRIES} failed for ${filename}: ${e}`);
      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff with jitter
        const delay = Math.min(RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
        const jitteredDelay = delay * (0.5 + Math.random() * 0.5);
        log.info(`Retrying in ${(jitteredDelay / 1000).toFixed(1)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, jitteredDelay));
      } else {
        throw new Error(`Failed to fetch ${filename} after ${MAX_RETRIES} attempts: ${e}`);
      }
    }
  }

  throw new Error(`Failed to fetch ${filename}`);
}

/**
 * Check if content has changed based on hash.
 */
export function contentHasChanged(content: string, oldHash: string): boolean {
  const newHash = createHash('sha256').update(content, 'utf-8').digest('hex');
  return newHash !== oldHash;
}

/**
 * Fetch Claude Code changelog from GitHub repository.
 */
export async function fetchChangelog(): Promise<{ filename: string; content: string }> {
  const changelogUrl = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md";
  const filename = "changelog.md";

  log.info(`Fetching Claude Code changelog: ${changelogUrl}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(changelogUrl, { headers: HEADERS });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        log.warning(`Rate limited. Waiting ${retryAfter} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let content = await response.text();

      // Add header to indicate this is from Claude Code repo
      const header = `# Claude Code Changelog

> **Source**: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
>
> This is the official Claude Code release changelog, automatically fetched from the Claude Code repository. For documentation, see other topics via \`/docs\`.

---

`;
      content = header + content;

      // Basic validation
      if (content.trim().length < 100) {
        throw new Error(`Changelog content too short (${content.length} bytes)`);
      }

      log.info(`Successfully fetched changelog (${content.length} bytes)`);
      return { filename, content };
    } catch (e) {
      log.warning(`Attempt ${attempt + 1}/${MAX_RETRIES} failed for changelog: ${e}`);
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.min(RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
        const jitteredDelay = delay * (0.5 + Math.random() * 0.5);
        log.info(`Retrying in ${(jitteredDelay / 1000).toFixed(1)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, jitteredDelay));
      } else {
        throw new Error(`Failed to fetch changelog after ${MAX_RETRIES} attempts: ${e}`);
      }
    }
  }

  throw new Error("Failed to fetch changelog");
}

/**
 * Save markdown file and return its hash.
 */
export async function saveMarkdownFile(docsDir: string, filename: string, content: string): Promise<string> {
  const filePath = join(docsDir, filename);

  try {
    await writeFile(filePath, content, 'utf-8');
    const contentHash = createHash('sha256').update(content, 'utf-8').digest('hex');
    log.info(`Saved: ${filename}`);
    return contentHash;
  } catch (e) {
    log.error(`Failed to save ${filename}: ${e}`);
    throw e;
  }
}

/**
 * Remove only files that were previously fetched but no longer exist.
 */
export async function cleanupOldFiles(docsDir: string, currentFiles: Set<string>, manifest: Manifest): Promise<void> {
  const previousFiles = new Set(Object.keys(manifest.files || {}));
  const filesToRemove = Array.from(previousFiles).filter(f => !currentFiles.has(f));

  for (const filename of filesToRemove) {
    if (filename === MANIFEST_FILE) continue;

    const filePath = join(docsDir, filename);
    if (existsSync(filePath)) {
      log.info(`Removing obsolete file: ${filename}`);
      await unlink(filePath);
    }
  }
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  log.info("Starting Claude Code documentation fetch (TypeScript version)");

  // Log configuration
  const githubRepo = process.env.GITHUB_REPOSITORY || 'greenstevester/claude-code-docs';
  log.info(`GitHub repository: ${githubRepo}`);

  // Create docs directory at repository root
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const docsDir = join(scriptDir, '..', 'docs');

  if (!existsSync(docsDir)) {
    await mkdir(docsDir, { recursive: true });
  }
  log.info(`Output directory: ${docsDir}`);

  // Load manifest
  const manifest = await loadManifest(docsDir);

  // Statistics
  let successful = 0;
  let failed = 0;
  const failedPages: string[] = [];
  const fetchedFiles = new Set<string>();
  const newManifest: Manifest = { files: {} };

  // Discover sitemap and base URL
  let sitemapUrl: string | null = null;
  let baseUrl: string;

  try {
    const result = await discoverSitemapAndBaseUrl();
    sitemapUrl = result.sitemapUrl;
    baseUrl = result.baseUrl;
  } catch (e) {
    log.error(`Failed to discover sitemap: ${e}`);
    log.info("Using fallback configuration...");
    baseUrl = "https://docs.anthropic.com";
  }

  // Discover documentation pages dynamically
  let documentationPages: string[];
  if (sitemapUrl) {
    documentationPages = await discoverClaudeCodePages(sitemapUrl);
  } else {
    // Fallback pages
    documentationPages = [
      "/en/docs/claude-code/overview",
      "/en/docs/claude-code/setup",
      "/en/docs/claude-code/quickstart",
      "/en/docs/claude-code/memory",
      "/en/docs/claude-code/common-workflows",
      "/en/docs/claude-code/ide-integrations",
      "/en/docs/claude-code/mcp",
      "/en/docs/claude-code/github-actions",
      "/en/docs/claude-code/sdk",
      "/en/docs/claude-code/troubleshooting",
      "/en/docs/claude-code/security",
      "/en/docs/claude-code/settings",
      "/en/docs/claude-code/hooks",
      "/en/docs/claude-code/costs",
      "/en/docs/claude-code/monitoring-usage",
    ];
  }

  if (documentationPages.length === 0) {
    log.error("No documentation pages discovered!");
    process.exit(1);
  }

  // Fetch each discovered page
  for (let i = 0; i < documentationPages.length; i++) {
    const pagePath = documentationPages[i];
    log.info(`Processing ${i + 1}/${documentationPages.length}: ${pagePath}`);

    try {
      const { filename, content } = await fetchMarkdownContent(pagePath, baseUrl);

      // Check if content has changed
      const oldHash = manifest.files?.[filename]?.hash || "";
      const oldEntry = manifest.files?.[filename] || {};

      let contentHash: string;
      let lastUpdated: string;

      if (contentHasChanged(content, oldHash)) {
        contentHash = await saveMarkdownFile(docsDir, filename, content);
        log.info(`Updated: ${filename}`);
        lastUpdated = new Date().toISOString();
      } else {
        contentHash = oldHash;
        log.info(`Unchanged: ${filename}`);
        lastUpdated = oldEntry.last_updated || new Date().toISOString();
      }

      newManifest.files[filename] = {
        original_url: `${baseUrl}${pagePath}`,
        original_md_url: `${baseUrl}${pagePath}.md`,
        hash: contentHash,
        last_updated: lastUpdated
      };

      fetchedFiles.add(filename);
      successful++;

      // Rate limiting
      if (i < documentationPages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    } catch (e) {
      log.error(`Failed to process ${pagePath}: ${e}`);
      failed++;
      failedPages.push(pagePath);
    }
  }

  // Fetch Claude Code changelog
  log.info("Fetching Claude Code changelog...");
  try {
    const { filename, content } = await fetchChangelog();

    // Check if content has changed
    const oldHash = manifest.files?.[filename]?.hash || "";
    const oldEntry = manifest.files?.[filename] || {};

    let contentHash: string;
    let lastUpdated: string;

    if (contentHasChanged(content, oldHash)) {
      contentHash = await saveMarkdownFile(docsDir, filename, content);
      log.info(`Updated: ${filename}`);
      lastUpdated = new Date().toISOString();
    } else {
      contentHash = oldHash;
      log.info(`Unchanged: ${filename}`);
      lastUpdated = oldEntry.last_updated || new Date().toISOString();
    }

    newManifest.files[filename] = {
      original_url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
      original_raw_url: "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md",
      hash: contentHash,
      last_updated: lastUpdated,
      source: "claude-code-repository"
    };

    fetchedFiles.add(filename);
    successful++;
  } catch (e) {
    log.error(`Failed to fetch changelog: ${e}`);
    failed++;
    failedPages.push("changelog");
  }

  // Clean up old files
  await cleanupOldFiles(docsDir, fetchedFiles, manifest);

  // Add metadata to manifest
  const duration = (Date.now() - startTime) / 1000;
  newManifest.fetch_metadata = {
    last_fetch_completed: new Date().toISOString(),
    fetch_duration_seconds: duration,
    total_pages_discovered: documentationPages.length,
    pages_fetched_successfully: successful,
    pages_failed: failed,
    failed_pages: failedPages,
    sitemap_url: sitemapUrl,
    base_url: baseUrl,
    total_files: fetchedFiles.size,
    fetch_tool_version: "3.0-TS"
  };

  // Save new manifest
  await saveManifest(docsDir, newManifest);

  // Summary
  const totalExpected = documentationPages.length + 1; // +1 for changelog
  log.info("\n" + "=".repeat(50));
  log.info(`Fetch completed in ${duration.toFixed(2)}s`);
  log.info(`Discovered pages: ${documentationPages.length}`);
  log.info(`Successful: ${successful}/${totalExpected} (including changelog)`);
  log.info(`Failed: ${failed}`);

  if (failedPages.length > 0) {
    log.warning("\nFailed pages (will retry next run):");
    for (const page of failedPages) {
      log.warning(`  - ${page}`);
    }
    // Exit with error to trigger workflow failure detection
    log.error(`Fetch completed with ${failed} failure(s)`);
    process.exit(1);
  } else {
    log.info("\nAll pages fetched successfully!");
  }
}

// Run main function only if this is the main module
if (import.meta.main) {
  main().catch(error => {
    log.error(`Unhandled error: ${error}`);
    process.exit(1);
  });
}
