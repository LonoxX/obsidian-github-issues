/**
 * GraphQL queries for GitHub Projects v2 API
 */

// Shared fragment for project field values - reduces query duplication
const FIELD_VALUES_FRAGMENT = `
fieldValues(first: 30) {
  nodes {
    ... on ProjectV2ItemFieldTextValue {
      text
      field { ... on ProjectV2Field { name } }
    }
    ... on ProjectV2ItemFieldNumberValue {
      number
      field { ... on ProjectV2Field { name } }
    }
    ... on ProjectV2ItemFieldDateValue {
      date
      field { ... on ProjectV2Field { name } }
    }
    ... on ProjectV2ItemFieldSingleSelectValue {
      name
      optionId
      field { ... on ProjectV2SingleSelectField { name } }
    }
    ... on ProjectV2ItemFieldIterationValue {
      title
      startDate
      duration
      iterationId
      field { ... on ProjectV2IterationField { name } }
    }
    ... on ProjectV2ItemFieldUserValue {
      users(first: 10) { nodes { login } }
      field { ... on ProjectV2Field { name } }
    }
    ... on ProjectV2ItemFieldLabelValue {
      labels(first: 20) { nodes { name } }
      field { ... on ProjectV2Field { name } }
    }
  }
}`;

// Shared fragment for project item info
const PROJECT_INFO_FRAGMENT = `
project {
  id
  title
  number
  url
}`;

// Query to get projects linked to a repository
export const GET_REPOSITORY_PROJECTS = `
query GetRepositoryProjects($owner: String!, $repo: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    projectsV2(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
}
`;

// Query to get projects for an organization
export const GET_ORGANIZATION_PROJECTS = `
query GetOrganizationProjects($org: String!, $first: Int!, $after: String) {
  organization(login: $org) {
    projectsV2(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
}
`;

// Query to get projects for a user
export const GET_USER_PROJECTS = `
query GetUserProjects($user: String!, $first: Int!, $after: String) {
  user(login: $user) {
    projectsV2(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
}
`;

// Query to get project fields (to understand the structure)
export const GET_PROJECT_FIELDS = `
query GetProjectFields($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          ... on ProjectV2Field {
            id
            name
            dataType
          }
          ... on ProjectV2IterationField {
            id
            name
            dataType
            configuration {
              iterations {
                id
                title
                startDate
                duration
              }
            }
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            dataType
            options {
              id
              name
              color
              description
            }
          }
        }
      }
    }
  }
}
`;

// Query to get project data for a specific issue or PR by node ID
export const GET_ITEM_PROJECT_DATA = `
query GetItemProjectData($nodeId: ID!) {
  node(id: $nodeId) {
    ... on Issue {
      projectItems(first: 10) {
        nodes {
          id
          ${PROJECT_INFO_FRAGMENT}
          ${FIELD_VALUES_FRAGMENT}
        }
      }
    }
    ... on PullRequest {
      projectItems(first: 10) {
        nodes {
          id
          ${PROJECT_INFO_FRAGMENT}
          ${FIELD_VALUES_FRAGMENT}
        }
      }
    }
  }
}
`;

// Query to batch-fetch project data for multiple issues/PRs
export const GET_ITEMS_PROJECT_DATA_BATCH = `
query GetItemsProjectDataBatch($nodeIds: [ID!]!) {
  nodes(ids: $nodeIds) {
    ... on Issue {
      id
      number
      projectItems(first: 10) {
        nodes {
          id
          ${PROJECT_INFO_FRAGMENT}
          ${FIELD_VALUES_FRAGMENT}
        }
      }
    }
    ... on PullRequest {
      id
      number
      projectItems(first: 10) {
        nodes {
          id
          ${PROJECT_INFO_FRAGMENT}
          ${FIELD_VALUES_FRAGMENT}
        }
      }
    }
  }
}
`;

// Types for GraphQL responses
export interface ProjectV2Node {
	id: string;
	title: string;
	number: number;
	url: string;
	closed: boolean;
}

export interface ProjectFieldValue {
	fieldName: string;
	type: 'text' | 'number' | 'date' | 'single_select' | 'iteration' | 'user' | 'labels';
	value: string | number | null;
	// Additional data for specific types
	startDate?: string;
	duration?: number;
	users?: string[];
	labels?: string[];
}

export interface ProjectItemData {
	projectId: string;
	projectTitle: string;
	projectNumber: number;
	projectUrl: string;
	fieldValues: ProjectFieldValue[];
}

export interface ItemProjectData {
	nodeId: string;
	itemNumber: number;
	projects: ProjectItemData[];
}

/**
 * Parse field values from GraphQL response into a normalized format
 */
export function parseFieldValues(fieldValuesNodes: any[]): ProjectFieldValue[] {
	const fieldValues: ProjectFieldValue[] = [];

	for (const node of fieldValuesNodes) {
		if (!node || !node.field?.name) continue;

		const fieldName = node.field.name;

		// Text field
		if ('text' in node && node.text !== undefined) {
			fieldValues.push({
				fieldName,
				type: 'text',
				value: node.text,
			});
		}
		// Number field
		else if ('number' in node && node.number !== undefined) {
			fieldValues.push({
				fieldName,
				type: 'number',
				value: node.number,
			});
		}
		// Date field
		else if ('date' in node && node.date !== undefined) {
			fieldValues.push({
				fieldName,
				type: 'date',
				value: node.date,
			});
		}
		// Single select field
		else if ('name' in node && 'optionId' in node) {
			fieldValues.push({
				fieldName,
				type: 'single_select',
				value: node.name,
			});
		}
		// Iteration field
		else if ('title' in node && 'iterationId' in node) {
			fieldValues.push({
				fieldName,
				type: 'iteration',
				value: node.title,
				startDate: node.startDate,
				duration: node.duration,
			});
		}
		// User field
		else if ('users' in node && node.users?.nodes) {
			const userLogins = node.users.nodes.map((u: any) => u.login);
			fieldValues.push({
				fieldName,
				type: 'user',
				value: userLogins.join(', '),
				users: userLogins,
			});
		}
		// Labels field
		else if ('labels' in node && node.labels?.nodes) {
			const labelNames = node.labels.nodes.map((l: any) => l.name);
			fieldValues.push({
				fieldName,
				type: 'labels',
				value: labelNames.join(', '),
				labels: labelNames,
			});
		}
	}

	return fieldValues;
}

/**
 * Parse a single item's project data from GraphQL response
 */
export function parseItemProjectData(itemNode: any): ProjectItemData[] {
	if (!itemNode?.projectItems?.nodes) {
		return [];
	}

	const projects: ProjectItemData[] = [];

	for (const projectItem of itemNode.projectItems.nodes) {
		if (!projectItem?.project) continue;

		projects.push({
			projectId: projectItem.project.id,
			projectTitle: projectItem.project.title,
			projectNumber: projectItem.project.number,
			projectUrl: projectItem.project.url,
			fieldValues: parseFieldValues(projectItem.fieldValues?.nodes || []),
		});
	}

	return projects;
}

// Query to get all items for a specific project
export const GET_PROJECT_ITEMS = `
query GetProjectItems($projectId: ID!, $first: Int!, $after: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          content {
            ... on Issue {
              number
              title
              state
              url
              body
              createdAt
              updatedAt
              closedAt
              author {
                login
              }
              assignees(first: 10) {
                nodes {
                  login
                }
              }
              labels(first: 10) {
                nodes {
                  name
                  color
                }
              }
              milestone {
                title
              }
            }
            ... on PullRequest {
              number
              title
              state
              url
              body
              createdAt
              updatedAt
              closedAt
              mergedAt
              merged
              author {
                login
              }
              assignees(first: 10) {
                nodes {
                  login
                }
              }
              labels(first: 10) {
                nodes {
                  name
                  color
                }
              }
              milestone {
                title
              }
              baseRefName
              headRefName
            }
          }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                field {
                  ... on ProjectV2Field {
                    name
                  }
                }
                text
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                field {
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
                name
              }
              ... on ProjectV2ItemFieldDateValue {
                field {
                  ... on ProjectV2Field {
                    name
                  }
                }
                date
              }
              ... on ProjectV2ItemFieldUserValue {
                field {
                  ... on ProjectV2Field {
                    name
                  }
                }
                users(first: 10) {
                  nodes {
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;
