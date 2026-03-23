# GitHub & GitLab Issues for Obsidian

![GitHub Release](https://img.shields.io/github/v/release/LonoxX/obsidian-github-issues)
![GitHub License](https://img.shields.io/github/license/LonoxX/obsidian-github-issues)
![GitHub Last Commit](https://img.shields.io/github/last-commit/LonoxX/obsidian-github-issues)
![Release Workflow](https://img.shields.io/github/actions/workflow/status/LonoxX/obsidian-github-issues/release.yml?label=release)
![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22github-issues%22%5D.downloads&url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json)
![GitHub Stars](https://img.shields.io/github/stars/LonoxX/obsidian-github-issues)
![GitHub Issues](https://img.shields.io/github/issues/LonoxX/obsidian-github-issues)

An Obsidian plugin that integrates with GitHub and GitLab to track issues and pull requests directly in your vault.

> The configurations are heavily inspired by https://github.com/schaier-io, including some specific settings. However, I had already started working on my prototype before I discovered the plugin, and had initially even given it a similar name.

# Documentation

Check out the [documentation](https://github.com/LonoxX/obsidian-github-issues/wiki) for detailed information on setup, configuration, and usage.

## Features

### Issue & Pull Request Tracking

- Track issues and pull requests from multiple GitHub and GitLab repositories
- Automatically sync data on startup (configurable)
- Background sync at configurable intervals
- Filter by labels, assignees, and reviewers
- Include or exclude closed issues/PRs
- Automatic cleanup of old closed items

### GitLab Support

- Full support for GitLab Issues and Merge Requests
- Works with self-hosted GitLab instances
- Multiple GitLab instances can be configured simultaneously

### GitHub Projects v2 Integration

- Track GitHub Projects across repositories
- Kanban board view for project visualization
- Custom field support (status, priority, iteration)
- Project-specific filtering and organization

### Sub-Issues Support

- Track sub-issues for both GitHub and GitLab (parent/child relationships)
- Display sub-issues list with status indicators
- Navigate between parent and child issues
- Progress tracking with completion percentage

### Settings Profiles

- Central configuration for folders, templates, sync behaviour, and filters
- Assign one profile to multiple repositories instead of configuring each one individually

### Markdown Notes

- Create markdown notes for each issue or PR
- Customizable filename templates with variables
- Custom content templates
- YAML frontmatter with metadata
- Preserve user content with persist blocks
- Include comments in notes

## Installation

### Via Community Plugins (Recommended)

1. Open Obsidian Settings
2. Navigate to **Community Plugins**
3. Click **Browse** and search for "GitHub Issues"
4. Click **Install** and then **Enable**

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/LonoxX/obsidian-github-issues/releases)
2. Extract to `<vault>/.obsidian/plugins/github-issues/`
3. Enable the plugin in **Community Plugins**
4. Reload Obsidian

## Configuration

### GitHub

1. Create a GitHub token with `repo` and `read:org` permissions
   → [GitHub Settings > Developer Settings > Personal access tokens](https://github.com/settings/tokens)
2. Paste the token in **Settings - Providers - GitHub Token**

### GitLab

1. Create a GitLab Personal Access Token with `read_api` scope
   → GitLab → Preferences → Access Tokens
2. Enable the GitLab provider in **Settings - Providers - GitLab Token** and paste your token

## Adding Repositories

1. Open the plugin settings in Obsidian
2. Add repositories by entering the full repository path (e.g., `lonoxx/obsidian-github-issues`),
   or use the repository browser to select one or multiple repositories
3. Click **Add Repository** or **Add Selected Repositories**
4. The plugin will automatically fetch issues from the configured repositories

## Support

If you find this plugin useful and would like to support its development, you can star the repository or support me on Ko-fi or [GitHub Sponsors](https://github.com/sponsors/LonoxX):

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/LonoxX)
