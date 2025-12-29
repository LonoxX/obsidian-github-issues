---
title: "{title_yaml}"
number: {number}
status: "{status}"
type: "{type}"
repository: "{repository}"
created: "{created}"
author: "{author}"
assignees: {assignees_yaml}
labels: {labels_yaml}
project: "{project}"
project_status: "{project_status}"
project_priority: "{project_priority}"
project_iteration: "{project_iteration}"
updateMode: "none"
allowDelete: true
---

# {title}

**{type} #{number}** in **{repository}**

{project:## Project

| Field | Value |
|-------|-------|
| **Project** | [{project}]({project_url}) |
| **Status** | {project_status} |
| **Priority** | {project_priority} |
| **Iteration** | {project_iteration} |
}
## Summary

{body}

## People

- **Author:** @{author}
- **Assignees:** {assignees}

## Classification

- **Status:** `{status}`
- **Labels:** {labels}
- **Milestone:** {milestone}
## Dates

- **Created:** {created}
- **Updated:** {updated}
- **Closed:** {closed}
## Links

[View on GitHub]({url}){project: | [View in Project]({project_url})}

{comments}

---

*Last updated: {updated}*
