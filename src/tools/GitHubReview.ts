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

interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
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
      const { owner, repo, type, identifier } = parseGitHubUrl(url);

      try {
        if (type === 'pull') {
          // Fetch PR details
          const [prResponse, filesResponse, commentsResponse] =
            await Promise.all([
              fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${identifier}`,
                {
                  headers: {
                    Accept: 'application/vnd.github.v3+json',
                    ...(GITHUB_TOKEN && {
                      Authorization: `token ${GITHUB_TOKEN}`,
                    }),
                  },
                }
              ),
              fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${identifier}/files`,
                {
                  headers: {
                    Accept: 'application/vnd.github.v3+json',
                    ...(GITHUB_TOKEN && {
                      Authorization: `token ${GITHUB_TOKEN}`,
                    }),
                  },
                }
              ),
              fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${identifier}/comments`,
                {
                  headers: {
                    Accept: 'application/vnd.github.v3+json',
                    ...(GITHUB_TOKEN && {
                      Authorization: `token ${GITHUB_TOKEN}`,
                    }),
                  },
                }
              ),
            ]);

          if (!prResponse.ok || !filesResponse.ok || !commentsResponse.ok) {
            throw new Error('Failed to fetch PR details');
          }

          const [prDetails, prFiles, prComments] = await Promise.all([
            prResponse.json(),
            filesResponse.json(),
            commentsResponse.json(),
          ]);

          return formatPRDetails(prDetails, prFiles, prComments);
        } else {
          // Fetch Commit details
          const commitResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${identifier}`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(GITHUB_TOKEN && { Authorization: `token ${GITHUB_TOKEN}` }),
              },
            }
          );

          if (!commitResponse.ok) {
            throw new Error('Failed to fetch commit details');
          }

          const commitDetails = await commitResponse.json();
          return formatCommitDetails(commitDetails);
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

- **Title**: ${pr.title}
- **Description**: ${pr.body || 'No description provided'}
- **State**: ${pr.state}
- **Created by**: ${pr.user.login}

### Changed Files (${files.length})
${files.map((file) => `- \`${file.filename}\` (${file.status})`).join('\n')}

### Code Changes
${files
  .map(
    (file) => `
#### File: \`${file.filename}\`
\`\`\`diff
${file.patch || 'No patch available'}
\`\`\`
`
  )
  .join('\n')}

### Comments (${comments.length})
${comments.map((comment) => `- **${comment.user.login}**: ${comment.body}`).join('\n')}
`;
}

function formatCommitDetails(commit: GitHubCommit) {
  return `
## Commit Details

- **SHA**: \`${commit.sha}\`
- **Author**: ${commit.commit.author.name} (${commit.commit.author.email})
- **Date**: ${commit.commit.author.date}
- **Message**: ${commit.commit.message}
`;
}

export { createGitHubReview };
