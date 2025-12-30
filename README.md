# GitHub Issues for Obsidian

An Obsidian plugin that integrates with GitHub to track issues and pull requests directly in your vault.


>The configurations are heavily inspired by https://github.com/schaier-io, including some specific settings. However, I had already started working on my prototype before I discovered the plugin, and had initially even given it a similar name.

## ✨ Features

### 🔄 Issue & Pull Request Tracking
- Track issues and pull requests from multiple GitHub repositories
- Automatically sync GitHub data on startup (configurable)
- Background sync at configurable intervals
- Filter by labels, assignees, and reviewers
- Include or exclude closed issues/PRs
- Automatic cleanup of old closed items

### 📊 GitHub Projects v2 Integration
- Track GitHub Projects across repositories
- Kanban board view for project visualization
- Custom field support (status, priority, iteration)
- Project-specific filtering and organization

### 📝 Markdown Notes
- Create markdown notes for each issue or PR
- Customizable filename templates with variables
- Custom content templates
- YAML frontmatter with metadata
- Preserve user content with persist blocks
- Include comments in notes

## 🚀 Installation

### Via Obsidian Community Plugins
1. Open Obsidian settings
2. Navigate to **Community Plugins**
3. Click **Browse** and search for "GitHub Issues"
4. Click **Install** and then **Enable**

### Manual Installation

1. Download the latest release from the [GitHub Releases page](https://github.com/LonoxX/obsidian-github-issues/releases).
2. Extract the contents into your Obsidian plugins folder:
   `<vault>/.obsidian/plugins/github-issues/`
3. Enable the plugin in Obsidian under **Community Plugins**
4. Reload or restart Obsidian

## ⚙️ Configuration

1. Create a new GitHub token with the `repo` and `read:org` permissions
   → [GitHub Settings > Developer Settings > Personal access tokens](https://github.com/settings/tokens)
2. Configure the plugin in Obsidian settings:
    - Paste your GitHub token in the **GitHub Token** field
    - Adjust additional settings as needed

## 📦 Adding Repositories

1. Open the plugin settings in Obsidian
2. Add repositories by entering the full GitHub repository path (e.g., `lonoxx/obsidian-github-issues`),
   or use the repository browser to select one or multiple repositories
3. Click **Add Repository** or **Add Selected Repositories**
4. The plugin will automatically fetch issues from the configured repositories

### ⭐ This repository if you like this project!


## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
