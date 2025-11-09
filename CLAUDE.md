# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a community-maintained mirror of Claude Code documentation from https://docs.anthropic.com/en/docs/claude-code/. The project provides local access to documentation with automatic synchronization from the official Anthropic documentation site.

**Key Architecture Components:**

1. **Documentation Fetcher** (`scripts/fetch_claude_docs.ts`): TypeScript/Bun-based script that discovers and fetches documentation from Anthropic's sitemap
2. **Helper Script** (`scripts/claude-docs-helper.sh.template`): Bash script template for the `/docs` command functionality
3. **Installer** (`install.sh`): Deployment script that sets up the documentation mirror at `~/.claude-code-docs`
4. **GitHub Actions** (`.github/workflows/update-docs.yml`): Automated workflow that runs every 3 hours to fetch updated documentation

## Development Commands

### Fetch Documentation

```bash
# Fetch latest documentation
bun run scripts/fetch_claude_docs.ts
```

### Run Tests

```bash
# Run all tests
bun test

# Run tests with coverage report
bun test --coverage
```

**Test Coverage:** The test suite achieves **93.94% function coverage** with 51 comprehensive tests covering:
- URL-to-filename conversion
- Markdown content validation
- Manifest operations (load/save)
- Sitemap discovery
- Documentation fetching with retry logic
- File operations
- Error handling and edge cases

### Testing the Installer

```bash
# Dry run to see what would be installed (not implemented - requires manual inspection)
./install.sh
```

### Testing the Helper Script

```bash
# After installation, test the helper script
~/.claude-code-docs/claude-docs-helper.sh <topic>
~/.claude-code-docs/claude-docs-helper.sh -t  # Check freshness
~/.claude-code-docs/claude-docs-helper.sh whats new
```

### Manual Workflow Trigger

```bash
# Trigger the GitHub Actions workflow manually using gh CLI
gh workflow run update-docs.yml
```

## Documentation Fetcher Architecture

The TypeScript fetcher (`fetch_claude_docs.ts`) implements:

1. **Sitemap Discovery**: Tries multiple sitemap URLs to find valid Claude Code documentation
2. **Dynamic Page Discovery**: Extracts all `/en/docs/claude-code/` pages from sitemap (English only)
3. **Content Validation**: Validates markdown content to ensure it's not HTML and contains expected patterns
4. **Hash-based Change Detection**: Uses SHA-256 hashing to detect content changes and avoid unnecessary updates
5. **Retry Logic**: Exponential backoff with jitter for failed requests (3 attempts max)
6. **Rate Limiting**: Implements delays between requests to respect server limits
7. **Manifest Management**: Tracks metadata about each fetched document in `docs/docs_manifest.json`
8. **Changelog Integration**: Fetches the official Claude Code CHANGELOG.md from the anthropics/claude-code repository

**Key Functions:**
- `discoverSitemapAndBaseUrl()`: Finds active sitemap and base URL
- `discoverClaudeCodePages()`: Dynamically discovers all documentation pages
- `fetchMarkdownContent()`: Fetches and validates markdown content
- `fetchChangelog()`: Fetches Claude Code release notes
- `contentHasChanged()`: Compares content hashes to detect updates

## Installation System

The installer (`install.sh`) handles:

1. **Fixed Installation Path**: Always installs to `~/.claude-code-docs` (v0.3+)
2. **Migration**: Automatically migrates from older installations
3. **Dependencies Check**: Verifies `git`, `jq`, and `curl` are installed
4. **Platform Detection**: Supports macOS and Linux (zsh/bash compatible)
5. **Claude Code Integration**:
   - Creates `/docs` command in `~/.claude/commands/docs.md`
   - Sets up PreToolUse hook in `~/.claude/settings.json` for automatic updates
6. **Cleanup**: Removes old installations after successful migration

**Installation Versions:**
- v0.1: Original version with user-specified paths
- v0.2: Simplified with script-based system
- v0.3: Fixed path at `~/.claude-code-docs` with improved stability
- v0.3.3: Added changelog integration and full macOS/Linux compatibility

## Helper Script Architecture

The helper script (`claude-docs-helper.sh.template`) provides:

- **Auto-update Logic**: Checks GitHub for newer commits and pulls automatically
- **Command Modes**:
  - Default: Read specific documentation topic
  - `-t` / `--check`: Check documentation freshness status
  - `whats new`: Show recent documentation changes
  - `uninstall`: Display uninstall instructions
  - `hook-check`: Background update check (called by PreToolUse hook)
- **Git Integration**: Checks local vs remote commit status
- **Input Sanitization**: Prevents command injection attacks
- **Search Interface**: Suggests related topics when exact match not found

## Manifest File Structure

The `docs/docs_manifest.json` tracks:

```json
{
  "files": {
    "topic.md": {
      "original_url": "https://docs.claude.com/en/docs/claude-code/topic",
      "original_md_url": "https://docs.claude.com/en/docs/claude-code/topic.md",
      "hash": "sha256-hash",
      "last_updated": "ISO-8601-timestamp"
    }
  },
  "last_updated": "ISO-8601-timestamp",
  "base_url": "https://raw.githubusercontent.com/...",
  "github_repository": "owner/repo",
  "github_ref": "branch-name",
  "fetch_metadata": {
    "last_fetch_completed": "ISO-8601-timestamp",
    "fetch_duration_seconds": 123.45,
    "total_pages_discovered": 50,
    "pages_fetched_successfully": 48,
    "pages_failed": 2,
    "failed_pages": ["page1", "page2"],
    "sitemap_url": "https://...",
    "base_url": "https://...",
    "total_files": 48,
    "fetch_tool_version": "3.0-TS"
  }
}
```

**Important:** The manifest is tracked by git. Content hashes prevent unnecessary file updates even if timestamps change.

## GitHub Actions Workflow

The workflow (`.github/workflows/update-docs.yml`) runs every 3 hours and:

1. Checks out the repository
2. Sets up Bun runtime
3. Runs the documentation fetcher
4. Detects changes using `git diff`
5. Generates detailed commit messages listing changed files
6. Commits and pushes updates
7. Creates GitHub issues on failure

**Environment Variables:**
- `GITHUB_REPOSITORY`: Used to set manifest metadata
- `GITHUB_REF_NAME`: Used to determine the branch

## Technology Stack

The documentation fetcher is written in TypeScript and runs on Bun:

- **TypeScript**: Type-safe implementation with modern async/await patterns
- **Bun Runtime**: Fast startup, native TypeScript support, modern fetch API
- **No Build Step**: Bun runs TypeScript directly without compilation

## Important File Naming Convention

Documentation files use a special naming convention for subdirectories:

- URL: `/en/docs/claude-code/parent/child` → File: `parent__child.md`
- Double underscores (`__`) replace forward slashes in nested paths
- Example: `sdk/migration-guide` → `sdk__migration-guide.md`

This is handled by `urlToSafeFilename()` in the fetcher.

## Security Considerations

1. **Input Sanitization**: Helper script sanitizes all user input to prevent command injection
2. **Git Safety**: Installer checks for uncommitted changes before removing old installations
3. **HTTPS Only**: All fetches use HTTPS
4. **No Secrets**: No API keys or sensitive data required
5. **Minimal Permissions**: PreToolUse hook only runs `git pull`

## User-Facing Features

When users install this tool, they get:

- `/docs` command to read documentation topics
- `/docs -t` to check sync status with GitHub
- `/docs whats new` to see recent documentation changes
- `/docs changelog` to read Claude Code release notes
- Automatic background updates when reading documentation
- Local-first access (works offline with cached docs)

## Common Development Workflows

### Adding New Documentation Sources

To fetch additional documentation beyond Claude Code docs:

1. Modify `discoverClaudeCodePages()` to include new URL patterns
2. Update skip patterns if needed
3. Test with `bun run scripts/fetch_claude_docs.ts`
4. Verify manifest updates correctly

### Debugging Fetch Issues

1. Check fetch logs for HTTP status codes
2. Verify sitemap is accessible: `curl https://docs.anthropic.com/sitemap.xml`
3. Test individual page fetch: `curl https://docs.anthropic.com/en/docs/claude-code/hooks.md`
4. Review `fetch_metadata` in manifest for failure details

### Testing Installation Changes

1. Make changes to `install.sh`
2. Test on clean system: `./install.sh`
3. Test upgrade from previous version
4. Verify `~/.claude/commands/docs.md` created correctly
5. Verify `~/.claude/settings.json` hook added correctly
6. Test `/docs` command in Claude Code

### Releasing New Versions

1. Update version in `install.sh` (SCRIPT_VERSION)
2. Update version in `claude-docs-helper.sh.template` (SCRIPT_VERSION)
3. Update README.md with changelog
4. Test installation on both macOS and Linux
5. Commit and push to main branch
6. Users get updates automatically on next `/docs` command

## Platform-Specific Notes

### macOS (zsh/bash)
- Installer fully compatible with zsh (default) and bash
- Uses `$HOME` for user directory (never `~` in comparisons)
- All regex patterns are POSIX-compatible

### Linux (bash)
- Tested on Ubuntu, Debian, Fedora
- Requires `jq` installation: `apt install jq` or `yum install jq`
- Git usually pre-installed

### Windows
- Not yet supported
- Contributions welcome to add PowerShell version

## Troubleshooting Development Issues

### Bun not installed
```bash
curl -fsSL https://bun.sh/install | bash
```

### TypeScript errors
```bash
bun install  # Install @types/bun
```

### Git merge conflicts in manifest
The installer automatically handles manifest conflicts - they're expected when remote has updates.

### Hook not triggering
1. Check `~/.claude/settings.json` has correct path
2. Restart Claude Code to reload settings
3. Verify hook command is executable: `chmod +x ~/.claude-code-docs/claude-docs-helper.sh`
