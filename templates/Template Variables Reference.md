# Template Variables Reference

## Basic Information

| Variable | Description | Example |
|----------|-------------|---------|
| `{title}` | Issue/PR title | "Fix login bug" |
| `{title_yaml}` | Issue/PR title (YAML-escaped) | "Fix \"login\" bug" |
| `{number}` | Issue/PR number | "123" |
| `{status}` | Current status | "open", "closed" |
| `{state}` | Synonym for status | "open", "closed" |
| `{author}` | Username of creator | "octocat" |
| `{body}` | Issue/PR description | Full description text |
| `{repository}` | Full repository name | "owner/repo-name" |
| `{owner}` | Repository owner | "octocat" |
| `{repoName}` | Repository name only | "repo-name" |
| `{type}` | Type of element | "issue" or "pr" |

## URLs and Links

| Variable | Description | Example |
|----------|-------------|---------|
| `{url}` | GitHub Web URL | "https://github.com/owner/repo/issues/123" |

## Assignees

| Variable | Description | Example |
|----------|-------------|---------|
| `{assignee}` | Primary assignee (first one) | "octocat" |
| `{assignees}` | All assignees as comma-separated list | "octocat, user2, user3" |
| `{assignees_list}` | All assignees as bullet list | "- octocat<br>- user2<br>- user3" |
| `{assignees_yaml}` | All assignees as YAML array | `["octocat", "user2", "user3"]` |

## Labels

| Variable | Description | Example |
|----------|-------------|---------|
| `{labels}` | All labels as comma-separated list | "bug, enhancement, priority-high" |
| `{labels_list}` | All labels as bullet list | "- bug<br>- enhancement<br>- priority-high" |
| `{labels_hash}` | All labels as hashtags | "#bug #enhancement #priority-high" |
| `{labels_yaml}` | All labels as YAML array | `["bug", "enhancement", "priority-high"]` |

## Dates

| Variable | Description | Example |
|----------|-------------|---------|
| `{created}` | Creation date | "9/5/2025" |
| `{updated}` | Last update date | "1/20/2024" |
| `{closed}` | Closing date (if closed) | "1/25/2024" |

## Pull Request Specific Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{mergedAt}` | Merge date (if merged) | "9/21/2025" |
| `{mergeable}` | Whether PR can be merged | "true" or "false" |
| `{merged}` | Whether PR was merged | "true" or "false" |
| `{baseBranch}` | Target branch | "main" |
| `{headBranch}` | Source branch | "feature/new-login" |

## Additional Information

| Variable | Description | Example |
|----------|-------------|---------|
| `{milestone}` | Milestone title | "v1.2.0 Release" |
| `{commentsCount}` | Number of comments | "5" |
| `{isLocked}` | Whether issue/PR is locked | "true" or "false" |
| `{lockReason}` | Reason for locking | "resolved", "spam", "off-topic" |
| `{comments}` | Formatted comments section | Complete comments with formatting |

## GitHub Projects

These variables are available when the issue/PR is part of a GitHub Project (Projects V2).

### Basic Project Information

| Variable | Description | Example |
|----------|-------------|---------|
| `{project}` | Project title (first project if in multiple) | "Sprint Board" |
| `{project_url}` | Project URL | "https://github.com/orgs/owner/projects/1" |
| `{project_number}` | Project number | "1" |
| `{project_status}` | Status field value | "In Progress", "Done" |
| `{project_priority}` | Priority field value | "High", "Medium", "Low" |

### Iteration Information

| Variable | Description | Example |
|----------|-------------|---------|
| `{project_iteration}` | Current iteration title | "Sprint 5" |
| `{project_iteration_start}` | Iteration start date | "2025-01-15" |
| `{project_iteration_duration}` | Iteration duration in days | "14" |

### Multiple Projects

| Variable | Description | Example |
|----------|-------------|---------|
| `{projects}` | All project names as comma-separated list | "Sprint Board, Backlog" |
| `{projects_yaml}` | All project names as YAML array | `["Sprint Board", "Backlog"]` |

### Custom Fields

| Variable | Description | Example |
|----------|-------------|---------|
| `{project_fields}` | All custom fields as YAML | `  Effort: "5"` (with newlines) |
| `{project_field:FieldName}` | Access specific custom field by name | `{project_field:Effort}` → "5" |

## Conditional Blocks

| Syntax | Description | Example |
|--------|-------------|---------|
| `{variable:content}` | Shows content only if variable has a value | `{milestone:Milestone: {milestone}}` |

### Project-related Conditionals

| Syntax | Description |
|--------|-------------|
| `{project:content}` | Shows content only if item is in a project |
| `{projects:content}` | Shows content if item is in any project |
