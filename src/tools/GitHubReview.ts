import { z } from 'zod';
import { Tool } from './Tool';

// GitHub API Response Interfaces
interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  type: string;
}

interface GitHubPullRequest {
  title: string;
  body: string | null;
  state: string;
  user: GitHubUser;
}

interface GitHubPullRequestFile {
  filename: string;
  status: string;
  patch?: string;
}

interface GitHubPullRequestComment {
  user: GitHubUser;
  body: string;
}

interface GitHubErrorResponse {
  message: string;
  documentation_url?: string;
}

// Add new interfaces for detailed commit analysis
interface GitHubCommitDetail {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  files: GitHubCommitFile[];
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
}

interface GitHubCommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

function parseGitHubUrl(url: string) {
  const prMatch = url.match(
    /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(pull|commit)\/([^/]+)/
  );
  if (!prMatch) {
    throw new Error(
      'Invalid GitHub URL. Must be a Pull Request or Commit URL.'
    );
  }
  return {
    owner: prMatch[1],
    repo: prMatch[2],
    type: prMatch[3] as 'pull' | 'commit',
    identifier: prMatch[4],
  };
}

async function makeGitHubRequest(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      ...(token && { Authorization: `token ${token}` }),
    },
  });

  if (
    response.status === 403 &&
    response.headers.get('X-RateLimit-Remaining') === '0'
  ) {
    const resetTime = new Date(
      Number(response.headers.get('X-RateLimit-Reset')) * 1000
    ).toLocaleString();
    throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}`);
  }

  if (!response.ok) {
    const error: GitHubErrorResponse = await response.json();
    throw new Error(`GitHub API error: ${error.message}`);
  }

  return response.json();
}

async function fetchAllPages<T>(baseUrl: string, token: string): Promise<T[]> {
  let page = 1;
  let allItems: T[] = [];

  while (true) {
    const url = `${baseUrl}?page=${page}&per_page=100`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(token && { Authorization: `token ${token}` }),
      },
    });

    if (!response.ok) break;

    const items: T[] = await response.json();
    if (items.length === 0) break;

    allItems = [...allItems, ...items];
    page++;
  }

  return allItems;
}

function createGitHubReview() {
  const paramsSchema = z.object({
    url: z.string().describe('GitHub Pull Request or Commit URL to review'),
  });

  return new Tool(
    paramsSchema,
    'github_review',
    'Useful for reviewing GitHub Pull Requests or Commits and providing detailed analysis',
    async ({ url }) => {
      const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || '';
      if (!GITHUB_TOKEN) {
        throw new Error(
          'GitHub token is required. Please set VITE_GITHUB_TOKEN in your environment variables.'
        );
      }
      const { owner, repo, type, identifier } = parseGitHubUrl(url);

      try {
        if (type === 'pull') {
          const prDetails = await makeGitHubRequest(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${identifier}`,
            GITHUB_TOKEN
          );

          const [prFiles, prComments] = await Promise.all([
            fetchAllPages<GitHubPullRequestFile>(
              `https://api.github.com/repos/${owner}/${repo}/pulls/${identifier}/files`,
              GITHUB_TOKEN
            ),
            fetchAllPages<GitHubPullRequestComment>(
              `https://api.github.com/repos/${owner}/${repo}/pulls/${identifier}/comments`,
              GITHUB_TOKEN
            ),
          ]);

          const d = formatPRDetails(prDetails, prFiles, prComments);
          return d;
        } else {
          // Fetch Commit details with files
          const commitResponse = await makeGitHubRequest(
            `https://api.github.com/repos/${owner}/${repo}/commits/${identifier}`,
            GITHUB_TOKEN
          );

          return formatCommitDetails(commitResponse);
        }
      } catch (error) {
        return `Error reviewing GitHub ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  );
}

function formatPRDetails(
  pr: GitHubPullRequest,
  files: GitHubPullRequestFile[],
  comments: GitHubPullRequestComment[]
) {
  return `
## Pull Request Details

Title: ${pr.title}
Author: ${pr.user.login}
Description: ${pr.body ? pr.body.trim() : 'No description provided'}

## Files Changed

${files
  .map(
    (file) => `
### ${file.filename}
Status: ${file.status}

${
  file.patch
    ? `\`\`\`diff
${file.patch}
\`\`\``
    : '*Binary file or changes too large*'
}
`
  )
  .join('\n')}

## Review Comments

${
  comments.length > 0
    ? comments
        .map(
          (comment) => `
**${comment.user.login}**: ${comment.body}
`
        )
        .join('\n')
    : '*No review comments yet*'
}
`;
}

function formatCommitDetails(commit: GitHubCommitDetail) {
  return `
## Commit Details

- **SHA**: \`${commit.sha}\`
- **Author**: ${commit.commit.author.name} (${commit.commit.author.email})
- **Date**: ${commit.commit.author.date}
- **Message**: ${commit.commit.message}

## Changes Overview
- Total files changed: ${commit.files.length}
- Additions: +${commit.stats.additions}
- Deletions: -${commit.stats.deletions}

## Detailed Changes
${commit.files
  .map(
    (file) => `
### ${file.filename}
- Status: ${file.status}
- Changes: +${file.additions} -${file.deletions}

${
  file.patch
    ? `\`\`\`diff
${file.patch}
\`\`\``
    : '*Binary file or changes too large*'
}
`
  )
  .join('\n')}
`;
}

export { createGitHubReview };
