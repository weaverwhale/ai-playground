import { z } from 'zod';
import { Tool } from './Tool';
import dotenv from 'dotenv';

dotenv.config();

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
    /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(pull|commit)\/([a-fA-F0-9]+)/
  );
  if (!prMatch) {
    throw new Error(
      'Invalid GitHub URL. Must be a Pull Request or Commit URL.'
    );
  }

  // Clean the identifier to ensure it's just the SHA/PR number
  const identifier = prMatch[4].replace(/[^a-fA-F0-9]/g, '');

  return {
    owner: prMatch[1],
    repo: prMatch[2],
    type: prMatch[3] as 'pull' | 'commit',
    identifier: identifier,
  };
}

async function makeGitHubRequest(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      ...(token && { Authorization: `Bearer ${token}` }),
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
    if (response.status === 404) {
      throw new Error(`Resource not found: ${error.message}`);
    }
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

async function fetchPRMergeStatus(
  owner: string,
  repo: string,
  prNumber: string,
  token: string
) {
  const prDetails = await makeGitHubRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    token
  );
  return prDetails.mergeable ? 'Mergeable' : 'Has conflicts';
}

async function fetchPRLabels(
  owner: string,
  repo: string,
  prNumber: string,
  token: string
) {
  const labels = await makeGitHubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`,
    token
  );
  return labels.map((label: { name: string }) => label.name).join(', ');
}

async function fetchCommitStatus(
  owner: string,
  repo: string,
  sha: string,
  token: string
) {
  const status = await makeGitHubRequest(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`,
    token
  );
  return status.state; // e.g., 'success', 'failure', 'pending'
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
      console.log('Reviewing GitHub URL:', url);
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
      if (!GITHUB_TOKEN) {
        throw new Error(
          'GitHub token is required. Please set GITHUB_TOKEN in your environment variables.'
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

          const mergeStatus = await fetchPRMergeStatus(
            owner,
            repo,
            identifier,
            GITHUB_TOKEN
          );
          const labels = await fetchPRLabels(
            owner,
            repo,
            identifier,
            GITHUB_TOKEN
          );

          const d = formatPRDetails(prDetails, prFiles, prComments);
          return `${d}\n\nMerge Status: ${mergeStatus}\nLabels: ${labels}`;
        } else {
          // Fetch Commit details
          const commitDetails: GitHubCommitDetail = await makeGitHubRequest(
            `https://api.github.com/repos/${owner}/${repo}/commits/${identifier}`,
            GITHUB_TOKEN
          );
          const commitStatus = await fetchCommitStatus(
            owner,
            repo,
            identifier,
            GITHUB_TOKEN
          );

          // Ensure the response matches our expected interface
          if (!commitDetails.sha || !commitDetails.commit) {
            throw new Error('Invalid commit response format');
          }

          return `${formatCommitDetails(commitDetails)}\n\nCI Status: ${commitStatus}`;
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('Resource not found')) {
            return `The specified ${type} could not be found. Please verify the URL and ensure you have access to the repository.`;
          }
          return `Error reviewing GitHub ${type}: ${error.message}`;
        }
        return `Error reviewing GitHub ${type}: Unknown error`;
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
