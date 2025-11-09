# Claude Code Documentation Mirror

[![Last Update](https://img.shields.io/github/last-commit/greenstevester/claude-code-docs/main.svg?label=docs%20updated)](https://github.com/greenstevester/claude-code-docs/commits/main)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue)]()

Local mirror of Claude Code documentation files from https://claude-code-docs.anthropic.com/en/claude-code-docs/claude-code/, updated every 12 hours.

**Quick Install**: `curl -fsSL https://raw.githubusercontent.com/greenstevester/claude-code-docs/main/install.sh | bash`

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [How Updates Work](#how-updates-work)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Why This Exists

Stop context-switching to your browser every time you need Claude Code documentation. Get instant answers in your terminal:

- **10x faster** - Read from local files instead of web pages (< 0.1s vs 2-3s)
- **Always current** - Auto-syncs with official docs every 3 hours
- **Track changes** - See exactly what changed in docs over time with diffs
- **Built for Claude** - Let Claude explore and cross-reference docs naturally
- **Offline ready** - Access documentation even without internet (after first sync)

**Before**: Alt-tab to browser → search docs → find topic → read → switch back
**After**: Type `/claude-code-docs hooks` → read → continue coding

## Platform Compatibility

- ✅ **macOS**: Fully supported (tested on macOS 12+)
- ✅ **Linux**: Fully supported (Ubuntu, Debian, Fedora, etc.)
- ⏳ **Windows**: Not yet supported - [contributions welcome](#contributing)!

### Prerequisites

You need these tools installed:
- **git** - For cloning and updating the repository (usually pre-installed)
- **jq** - For JSON processing in the auto-update hook (pre-installed on macOS; Linux users may need `apt install jq` or `yum install jq`)
- **curl** - For downloading the installation script (usually pre-installed)
- **Claude Code** - Obviously :)

**Quick check**: Verify you have everything before installing:
```bash
for cmd in git jq curl; do command -v $cmd >/dev/null 2>&1 && echo "✓ $cmd installed" || echo "✗ $cmd missing"; done
```

If any show "missing", install them first:
- **Ubuntu/Debian**: `sudo apt install git jq curl`
- **Fedora/RHEL**: `sudo yum install git jq curl`
- **macOS**: `brew install jq` (git and curl pre-installed)

## Installation

Run this single command:

```bash
curl -fsSL https://raw.githubusercontent.com/greenstevester/claude-code-docs/main/install.sh | bash
```

The installer will:
1. Clone the repository to `~/.claude-code-docs`
2. Create the `/claude-code-docs` slash command in your Claude Code commands
3. Set up automatic background updates when you read documentation

**Installation completes in ~10 seconds**. You'll see a success message with available documentation topics.

**Note**: After installation, restart Claude Code or start a new session to load the `/claude-code-docs` command.

## Quick Start

Verify the installation works:

```bash
/claude-code-docs                    # List all available topics
/claude-code-docs quickstart         # Read the quickstart guide (good first doc!)
```

**Expected output:**
```
📚 Reading from local docs (run /claude-code-docs -t to check freshness)
📖 OFFICIAL DOCS: https://claude-code-docs.anthropic.com/en/claude-code-docs/claude-code/quickstart

# Quick Start Guide
[Documentation content appears here...]
```

That's it! You now have instant local access to all Claude Code documentation.

## Usage

### Basic Commands

| Command | Description |
|---------|-------------|
| `/claude-code-docs` | List all available topics |
| `/claude-code-docs <topic>` | Read specific documentation instantly |
| `/claude-code-docs -t` | Check sync status with GitHub |
| `/claude-code-docs -t <topic>` | Check sync, then read docs |
| `/claude-code-docs what's new` | Show recent doc changes with diffs |
| `/claude-code-docs changelog` | Read Claude Code release notes |
| `/claude-code-docs uninstall` | Get uninstall instructions |

### Common Examples

**Read documentation:**
```bash
/claude-code-docs hooks        # Hooks documentation
/claude-code-docs mcp          # MCP server documentation
/claude-code-docs memory       # Memory system docs
/claude-code-docs quickstart   # Getting started guide
```

**Check for updates:**
```bash
/claude-code-docs -t           # Check sync status
/claude-code-docs -t hooks     # Check sync, then read hooks docs
/claude-code-docs what's new   # See what changed recently
```

**Natural language queries** (Claude will search and cross-reference):
```bash
/claude-code-docs what environment variables exist and how do I use them?
/claude-code-docs explain the differences between hooks and MCP
/claude-code-docs how do I customize Claude Code's behavior?
/claude-code-docs find all mentions of authentication
```

### How It Works

- **Default mode**: Reads instantly from local files (< 0.1s)
- **With `-t` flag**: Checks GitHub first, pulls updates if available (~0.4s)
- **Background updates**: Automatic sync when reading docs (transparent, no blocking)

## How Updates Work

Your local docs stay synchronized automatically through two mechanisms:

1. **Background sync**: GitHub Actions fetches official docs every 3 hours and commits changes
2. **Automatic pull**: When you read docs, a background check pulls the latest version if available (~0.4s)

You'll see `🔄 Updating documentation...` briefly when updates are downloaded. This happens transparently without blocking your workflow.

**Manual update**: If needed, you can force an update:
```bash
/claude-code-docs -t              # Check sync status and pull latest
# OR
cd ~/.claude-code-docs && git pull
```

**Fresh install**: To completely refresh your installation:
```bash
curl -fsSL https://raw.githubusercontent.com/greenstevester/claude-code-docs/main/install.sh | bash
```

## Updating from Previous Versions

Regardless of which version you have installed, simply run:

```bash
curl -fsSL https://raw.githubusercontent.com/greenstevester/claude-code-docs/main/install.sh | bash
```

The installer will handle migration and updates automatically.

## Troubleshooting

### "/claude-code-docs: command not found"
**Problem**: Command doesn't work after installation

**Solutions**:
1. **Restart Claude Code** - The new command needs a fresh session to load
2. **Verify installation**:
   ```bash
   ls ~/.claude/commands/claude-code-docs.md    # Should exist
   ls ~/.claude-code-docs/          # Should exist
   ```
3. **Reinstall**: Run the installer again if files are missing

### Documentation not updating
**Problem**: Docs seem outdated or `/claude-code-docs -t` shows old timestamp

**Solutions**:
1. **Force sync**: `/claude-code-docs -t` checks GitHub and pulls latest
2. **Manual update**:
   ```bash
   cd ~/.claude-code-docs && git pull
   ```
3. **Nuclear option**: Reinstall completely:
   ```bash
   rm -rf ~/.claude-code-docs
   curl -fsSL https://raw.githubusercontent.com/greenstevester/claude-code-docs/main/install.sh | bash
   ```

### Installation errors

**"Failed to update settings.json"**
- Check file permissions: `ls -la ~/.claude/settings.json`
- Fix permissions: `chmod 644 ~/.claude/settings.json`
- Ensure `~/.claude/` directory exists: `mkdir -p ~/.claude`

## Uninstalling

To completely remove the docs integration:

```bash
/claude-code-docs uninstall
```

Or run:
```bash
~/.claude-code-docs/uninstall.sh
```

See [UNINSTALL.md](UNINSTALL.md) for manual uninstall instructions.

## Security & Privacy

**What the installer does:**
- Clones this repository to `~/.claude-code-docs` via HTTPS
- Creates a slash command file at `~/.claude/commands/claude-code-docs.md`
- Adds a hook to `~/.claude/settings.json` that runs `git pull` when you read docs

**What it NEVER does:**
- Send any data externally (100% local operations)
- Execute code from the internet (only reads documentation files)
- Access files outside `~/.claude-code-docs` directory
- Modify Claude Code itself (only user config files)

**Trust & verification:**
- All source code is open and reviewable in this repository
- For maximum security:
  - Fork the repository and install from your fork
  - Clone manually and review code before running installer
  - Audit the helper script: `~/.claude-code-docs/claude-docs-helper.sh`

**Network access:**
- Only connects to GitHub to fetch documentation updates
- No telemetry, analytics, or external tracking of any kind

## Contributing

**Contributions are welcome!** This is a community project and we'd love your help:

- 🪟 **Windows Support**: Want to help add Windows compatibility? [Fork the repository](https://github.com/greenstevester/claude-code-docs/fork) and submit a PR!
- 🐛 **Bug Reports**: Found something not working? [Open an issue](https://github.com/greenstevester/claude-code-docs/issues)
- 💡 **Feature Requests**: Have an idea? [Start a discussion](https://github.com/greenstevester/claude-code-docs/issues)
- 📝 **Documentation**: Help improve docs or add examples

You can also use Claude Code itself to help build features - just fork the repo and let Claude assist you!

## Known Issues

As this is an early beta, you might encounter some issues:
- Auto-updates may occasionally fail on some network configurations
- Some documentation links might not resolve correctly

If you find any issues not listed here, please [report them](https://github.com/greenstevester/claude-code-docs/issues)!

## License

Documentation content belongs to Anthropic.
This mirror tool is open source - contributions welcome!
