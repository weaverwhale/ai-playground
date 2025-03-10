import { z } from 'zod';
import { Tool } from './Tool';
import dotenv from 'dotenv';
import { weeklyReportPrompt } from '../constants';

dotenv.config();

// Interfaces for GitHub API responses
interface GitHubPR {
  title: string;
  number: number;
  createdAt: string;
  repo: string;
}

interface GitHubCommit {
  commit: {
    author: {
      date: string;
    };
    message: string;
  };
  repo: string;
}

async function makeGitHubRequest(
  url: string,
  token: string,
  customAcceptHeader?: string,
  retryCount = 0,
  maxRetries = 3
) {
  try {
    console.log(`Making GitHub API request to: ${url}`);

    const response = await fetch(url, {
      headers: {
        Accept: customAcceptHeader || 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    // Log rate limit information
    const rateLimit = {
      limit: response.headers.get('X-RateLimit-Limit'),
      remaining: response.headers.get('X-RateLimit-Remaining'),
      reset: response.headers.get('X-RateLimit-Reset')
        ? new Date(
            Number(response.headers.get('X-RateLimit-Reset')) * 1000
          ).toLocaleString()
        : 'unknown',
      resetSeconds: response.headers.get('X-RateLimit-Reset')
        ? Number(response.headers.get('X-RateLimit-Reset')) -
          Math.floor(Date.now() / 1000)
        : 0,
    };
    console.log(
      `GitHub API rate limit: ${rateLimit.remaining}/${rateLimit.limit}, resets at ${rateLimit.reset} (in ${rateLimit.resetSeconds} seconds)`
    );

    // Handle rate limiting
    if (
      (response.status === 403 &&
        response.headers.get('X-RateLimit-Remaining') === '0') ||
      response.status === 429
    ) {
      if (retryCount < maxRetries) {
        // Calculate backoff time - either use reset time from headers or exponential backoff
        let waitTime = 0;

        if (response.headers.get('X-RateLimit-Reset')) {
          // Use the reset time from headers, plus a small buffer
          waitTime =
            Number(response.headers.get('X-RateLimit-Reset')) * 1000 -
            Date.now() +
            1000;
          // Cap the wait time at 10 minutes to avoid excessive waiting
          waitTime = Math.min(waitTime, 10 * 60 * 1000);
        } else {
          // Use exponential backoff with jitter
          waitTime = Math.min(
            1000 * Math.pow(2, retryCount) + Math.random() * 1000,
            60000
          );
        }

        console.log(
          `Rate limit hit. Retrying in ${Math.ceil(waitTime / 1000)} seconds (retry ${retryCount + 1}/${maxRetries})...`
        );

        // Wait for the calculated time
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Retry the request
        return makeGitHubRequest(
          url,
          token,
          customAcceptHeader,
          retryCount + 1,
          maxRetries
        );
      }

      const resetTime = rateLimit.reset;
      throw new Error(
        `GitHub API rate limit exceeded. Resets at ${resetTime}. Please try again later.`
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `GitHub API error (${response.status})`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage += `: ${errorData.message || errorText}`;
        if (errorData.errors) {
          errorMessage += ` - ${JSON.stringify(errorData.errors)}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error in makeGitHubRequest for ${url}:`, error);
    throw error;
  }
}

/**
 * Processes an array of items with a rate-limited API function
 * @param items Array of items to process
 * @param processFn Function that processes a single item and returns a promise
 * @param batchSize Number of items to process in parallel
 * @param delayBetweenBatches Delay in ms between batches to avoid rate limiting
 */
async function processBatchedRequests<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  batchSize = 5,
  delayBetweenBatches = 1000
): Promise<R[]> {
  const results: R[] = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`
    );

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map((item) =>
        processFn(item).catch((error) => {
          console.error(`Error processing item:`, error);
          return null;
        })
      )
    );

    // Add successful results
    results.push(...(batchResults.filter((result) => result !== null) as R[]));

    // If not the last batch, wait before processing the next one
    if (i + batchSize < items.length) {
      console.log(`Waiting ${delayBetweenBatches}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

async function getDateRange(
  offsetWeeks: number = 0,
  startDateStr?: string,
  endDateStr?: string
): Promise<{ startDate: string; endDate: string }> {
  // If explicit dates are provided, use them
  if (startDateStr && endDateStr) {
    return {
      startDate: startDateStr,
      endDate: endDateStr,
    };
  }

  // Otherwise, calculate based on current date
  const now = new Date();

  if (offsetWeeks === 0) {
    // Default case: previous 7 days from today
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 7); // Go back 7 days

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    };
  } else {
    // Support for legacy offset behavior
    // Get the date for last Sunday
    const day = now.getDay();
    const diff = day === 0 ? 7 : day; // If today is Sunday, go back 7 days

    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - diff - 7 * offsetWeeks);

    const nextSaturday = new Date(lastSunday);
    nextSaturday.setDate(lastSunday.getDate() + 6);

    return {
      startDate: formatDate(lastSunday),
      endDate: formatDate(nextSaturday),
    };
  }
}

// Helper function to format dates without external dependencies
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

// Helper function to format display dates
function formatDisplayDate(date: Date): string {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const dayName = days[date.getDay()];
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${dayName} ${month}/${day}`;
}

async function fetchUserPRs(
  repos: string[],
  username: string,
  startDate: string,
  endDate: string,
  token: string
): Promise<GitHubPR[]> {
  console.log(
    `Fetching PRs for ${username} from ${startDate} to ${endDate} across ${repos.length} repositories`
  );

  // Use the batching utility to process repositories in batches
  const fetchReposPRs = async (repo: string): Promise<GitHubPR[]> => {
    try {
      // The repo should already be in the format "org/repo" at this point
      const fullRepoName = repo;
      const repoName = repo.includes('/') ? repo.split('/')[1] : repo;

      console.log(`Fetching PRs for repository: ${fullRepoName}`);

      const searchQuery = `repo:${fullRepoName} author:${username} created:${startDate}..${endDate} type:pr`;
      const baseUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}`;

      // For search API, we can't use fetchAllPages directly because the response structure is different
      // Instead, we'll manually handle pagination for search results
      let page = 1;
      let hasMorePages = true;
      let repoPRs: GitHubPR[] = [];

      while (hasMorePages) {
        const url = `${baseUrl}&page=${page}&per_page=100`;
        const data = await makeGitHubRequest(url, token);

        if (data.items && Array.isArray(data.items)) {
          const prs = data.items.map(
            (item: { title: string; number: number; created_at: string }) => ({
              title: item.title,
              number: item.number,
              createdAt: item.created_at,
              repo: repoName,
            })
          );

          repoPRs = [...repoPRs, ...prs];

          // Check if we have more pages
          hasMorePages = data.items.length === 100;
          page++;
        } else {
          hasMorePages = false;
        }
      }

      return repoPRs;
    } catch (error) {
      console.error(`Error fetching PRs for ${repo}:`, error);
      return [];
    }
  };

  // Process repositories in batches to avoid rate limits
  const allPRs = await processBatchedRequests(repos, fetchReposPRs, 3, 2000);

  // Flatten the array of arrays
  return allPRs.flat();
}

async function fetchUserCommits(
  repos: string[],
  username: string,
  startDate: string,
  endDate: string,
  token: string
): Promise<GitHubCommit[]> {
  console.log(
    `Fetching commits for ${username} from ${startDate} to ${endDate} across ${repos.length} repositories`
  );

  // Use the batching utility to process repositories in batches
  const fetchReposCommits = async (repo: string): Promise<GitHubCommit[]> => {
    try {
      // The repo should already be in the format "org/repo" at this point
      const fullRepoName = repo;
      const repoName = repo.includes('/') ? repo.split('/')[1] : repo;

      console.log(`Fetching commits for repository: ${fullRepoName}`);

      // For commits search, we need to use the special header for the search API
      const searchQuery = `repo:${fullRepoName} author:${username} committer-date:${startDate}..${endDate}`;
      const baseUrl = `https://api.github.com/search/commits?q=${encodeURIComponent(searchQuery)}`;

      // For search API, we can't use fetchAllPages directly because the response structure is different
      // Instead, we'll manually handle pagination for search results
      let page = 1;
      let hasMorePages = true;
      let repoCommits: GitHubCommit[] = [];

      while (hasMorePages) {
        const url = `${baseUrl}&page=${page}&per_page=100`;
        const data = await makeGitHubRequest(
          url,
          token,
          'application/vnd.github.cloak-preview+json'
        );

        if (data.items && Array.isArray(data.items)) {
          const commits = data.items.map(
            (item: {
              commit: {
                author: {
                  date: string;
                };
                message: string;
              };
            }) => ({
              commit: {
                author: {
                  date: item.commit.author.date,
                },
                message: item.commit.message,
              },
              repo: repoName,
            })
          );

          repoCommits = [...repoCommits, ...commits];

          // Check if we have more pages
          hasMorePages = data.items.length === 100;
          page++;
        } else {
          hasMorePages = false;
        }
      }

      return repoCommits;
    } catch (error) {
      console.error(`Error fetching commits for ${repo}:`, error);
      return [];
    }
  };

  // Process repositories in batches to avoid rate limits
  const allCommits = await processBatchedRequests(
    repos,
    fetchReposCommits,
    3,
    2000
  );

  // Flatten the array of arrays
  return allCommits.flat();
}

async function fetchUserRepositories(
  username: string,
  organization: string,
  token: string,
  lookbackMonths: number = 6
): Promise<string[]> {
  console.log(
    `Fetching repositories for user ${username} in organization ${organization}`
  );

  try {
    // Calculate date from X months ago
    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
    const startDate = formatDate(lookbackDate);
    const endDate = formatDate(new Date());

    // Try multiple approaches to find repositories the user has contributed to
    const repoSet = new Set<string>();

    // Approach 1: Search for commits by the user across the organization
    console.log(
      `Approach 1: Searching for commits by ${username} in ${organization} from ${startDate} to ${endDate}`
    );
    const searchQuery = `org:${organization} author:${username} committer-date:${startDate}..${endDate}`;
    const url = `https://api.github.com/search/commits?q=${encodeURIComponent(searchQuery)}&per_page=100`;

    try {
      const data = await makeGitHubRequest(
        url,
        token,
        'application/vnd.github.cloak-preview+json'
      );

      // Log the response structure to help debug
      console.log(
        `GitHub API response: total_count=${data.total_count}, items_length=${data.items?.length || 0}`
      );

      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        // Extract unique repository names
        data.items.forEach(
          (item: { repository?: { name?: string; full_name?: string } }) => {
            if (item.repository && item.repository.full_name) {
              repoSet.add(item.repository.full_name);
            } else if (item.repository && item.repository.name) {
              repoSet.add(`${organization}/${item.repository.name}`);
            }
          }
        );

        console.log(`Found ${repoSet.size} repositories from commit history`);
      }
    } catch (error) {
      console.error(`Error in approach 1:`, error);
    }

    // If we didn't find any repos with approach 1, try approach 2
    if (repoSet.size === 0) {
      // Approach 2: Get user's repositories directly
      console.log(`Approach 2: Fetching user's repositories directly`);
      try {
        const userReposUrl = `https://api.github.com/users/${username}/repos?per_page=100`;
        const userReposData = await makeGitHubRequest(userReposUrl, token);

        if (Array.isArray(userReposData) && userReposData.length > 0) {
          userReposData
            .filter((repo) => repo.owner && repo.owner.login === organization)
            .forEach((repo) => repoSet.add(repo.full_name));

          console.log(`Found ${repoSet.size} repositories from user's repos`);
        }
      } catch (error) {
        console.error(`Error in approach 2:`, error);
      }
    }

    // If we still didn't find any repos, try approach 3
    if (repoSet.size === 0) {
      // Approach 3: Get organization repositories and check for user contributions
      console.log(
        `Approach 3: Checking organization repositories for user contributions`
      );
      try {
        const orgReposUrl = `https://api.github.com/orgs/${organization}/repos?per_page=100`;
        const orgReposData = await makeGitHubRequest(orgReposUrl, token);

        if (Array.isArray(orgReposData) && orgReposData.length > 0) {
          // Get the most active repositories in the organization (up to 10)
          const activeRepos = orgReposData
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 10);

          console.log(
            `Checking ${activeRepos.length} most active repositories in the organization`
          );

          // Check each repository for user contributions
          for (const repo of activeRepos) {
            try {
              const contributorsUrl = `https://api.github.com/repos/${repo.full_name}/contributors`;
              const contributorsData = await makeGitHubRequest(
                contributorsUrl,
                token
              );

              if (Array.isArray(contributorsData)) {
                const isContributor = contributorsData.some(
                  (contributor) => contributor.login === username
                );

                if (isContributor) {
                  repoSet.add(repo.full_name);
                  console.log(`Found user as contributor to ${repo.full_name}`);
                }
              }
            } catch (error) {
              console.error(
                `Error checking contributors for ${repo.full_name}:`,
                error
              );
            }

            // Add a small delay between requests to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          console.log(
            `Found ${repoSet.size} repositories from organization repos`
          );
        }
      } catch (error) {
        console.error(`Error in approach 3:`, error);
      }
    }

    const repos = Array.from(repoSet);
    console.log(
      `Total repositories found for user ${username}: ${repos.length}`
    );
    return repos;
  } catch (error) {
    console.error(`Error fetching user repositories:`, error);
    return [];
  }
}

async function generateWeeklyReport(
  repos: string[],
  startDate: string,
  endDate: string,
  token: string,
  username: string,
  openAiApiKey?: string,
  openAiModel: string = 'gpt-4o'
): Promise<string> {
  // Fetch PRs and commits
  try {
    const [prs, commits] = await Promise.all([
      fetchUserPRs(repos, username, startDate, endDate, token),
      fetchUserCommits(repos, username, startDate, endDate, token),
    ]);

    console.log(`Found ${prs.length} PRs and ${commits.length} commits`);

    // Generate report content
    let reportContent = `# Weekly Report for ${username}: ${startDate} to ${endDate}\n\n`;

    // Create a date range for the week
    const startDateObj = new Date(startDate);

    // For each day of the week
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDateObj);
      currentDate.setDate(startDateObj.getDate() + i);

      const dateStr = formatDate(currentDate);
      const displayDate = formatDisplayDate(currentDate);

      reportContent += `## ${displayDate}\n\n`;

      // Filter PRs for this day
      const dayPRs = prs.filter((pr) => pr.createdAt.startsWith(dateStr));
      if (dayPRs.length > 0) {
        reportContent += `  ### PRs\n\n`;
        for (const pr of dayPRs) {
          reportContent += `  - [#${pr.number}] ${pr.title} (${pr.repo})\n`;
        }
        reportContent += '\n';
      }

      // Filter commits for this day
      const dayCommits = commits.filter((commit) =>
        commit.commit.author.date.startsWith(dateStr)
      );
      if (dayCommits.length > 0) {
        reportContent += `  ### Commits\n\n`;
        for (const commit of dayCommits) {
          // Replace newlines in commit messages with spaces
          const message = commit.commit.message.replace(/\n/g, ' ');
          reportContent += `  - ${message} (${commit.repo})\n`;
        }
        reportContent += '\n';
      }

      reportContent += '\n';
    }

    // Generate AI summary if API key is provided
    if (openAiApiKey) {
      try {
        const response = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openAiApiKey}`,
            },
            body: JSON.stringify({
              model: openAiModel,
              temperature: 0.2,
              messages: [
                { role: 'system', content: weeklyReportPrompt },
                { role: 'user', content: reportContent },
              ],
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const summary = data.choices[0].message.content;
          reportContent += `\n### Quick Summary:\n${summary}\n`;
        }
      } catch (error) {
        console.error('Error generating AI summary:', error);
        reportContent +=
          '\n### Quick Summary:\nFailed to generate AI summary.\n';
      }
    }

    // Remove file writing code and just return the content
    // const reportFileName = `weekly_report_${startDate}_to_${endDate}.md`;
    // await fs.writeFile(reportFileName, reportContent);

    return reportContent;
  } catch (error) {
    if (error instanceof Error) {
      return `Error generating weekly report: ${error.message}`;
    }
    return 'Error generating weekly report: Unknown error';
  }
}

function createWeeklyReport() {
  const paramsSchema = z.object({
    username: z.string().describe('GitHub username to generate report for'),
    offset: z
      .number()
      .optional()
      .describe('Offset the week range by this many weeks (default: 0)'),
    repos: z
      .array(z.string())
      .optional()
      .describe('List of repositories to include in the report'),
    generateSummary: z
      .boolean()
      .optional()
      .describe('Whether to generate an AI summary (default: false)'),
    organization: z.string().optional().describe('GitHub organization name'),
    startDate: z
      .string()
      .optional()
      .describe('Start date in YYYY-MM-DD format (overrides offset)'),
    endDate: z
      .string()
      .optional()
      .describe('End date in YYYY-MM-DD format (overrides offset)'),
  });

  return new Tool(
    paramsSchema,
    'weekly_report',
    'Generates a weekly report of GitHub activity for a specific user including PRs and commits',
    async ({
      username,
      offset = 0,
      repos,
      generateSummary = false,
      organization = 'Triple-Whale',
      startDate,
      endDate,
    }) => {
      console.log(`Generating weekly report for ${username}...`);

      const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
      if (!GITHUB_TOKEN) {
        throw new Error(
          'GitHub token is required. Please set GITHUB_TOKEN in your environment variables.'
        );
      }

      // Validate GitHub token by making a test request
      try {
        await makeGitHubRequest('https://api.github.com/user', GITHUB_TOKEN);
      } catch (error) {
        console.error('Error validating GitHub token:', error);
        if (error instanceof Error) {
          return `Error: GitHub token validation failed - ${error.message}`;
        }
        return 'Error: GitHub token validation failed';
      }

      // Default repositories as fallback if we can't fetch user repos
      const fallbackRepos = [
        'backend-packages',
        'triplewhale-backend',
        'triplewhale-client',
        'triplewhale-admin',
        'fetchers',
        'devops',
        'ai',
      ];

      let reposToUse: string[] = [];

      if (!repos) {
        // Try to fetch repositories the user has committed to
        try {
          console.log(
            `Attempting to fetch repositories for user: ${username} in organization: ${organization}`
          );
          const userRepos = await fetchUserRepositories(
            username,
            organization,
            GITHUB_TOKEN
          );

          if (userRepos.length > 0) {
            console.log(
              `Successfully found ${userRepos.length} repositories for user ${username}`
            );
            reposToUse = [
              ...userRepos,
              ...fallbackRepos.map((repo) => `${organization}/${repo}`),
            ];
            // Remove duplicates
            reposToUse = [...new Set(reposToUse)];
          } else {
            console.log('No repositories found for user, using fallback list');
            // Format fallback repos with organization
            reposToUse = fallbackRepos.map((repo) => `${organization}/${repo}`);
          }
        } catch (error) {
          console.error('Error fetching user repositories:', error);
          // Format fallback repos with organization
          reposToUse = fallbackRepos.map((repo) => `${organization}/${repo}`);
        }
      } else {
        console.log(`Using provided repositories: ${repos.join(', ')}`);
        // Format provided repos with organization if needed
        reposToUse = repos.map((repo) =>
          repo.includes('/') ? repo : `${organization}/${repo}`
        );
      }

      try {
        const { startDate: calculatedStartDate, endDate: calculatedEndDate } =
          await getDateRange(offset, startDate, endDate);

        const openAiApiKey = generateSummary
          ? process.env.OPENAI_API_KEY
          : undefined;
        if (generateSummary && !openAiApiKey) {
          console.warn(
            'OpenAI API key not found. Summary will not be generated.'
          );
        }

        const report = await generateWeeklyReport(
          reposToUse,
          calculatedStartDate,
          calculatedEndDate,
          GITHUB_TOKEN,
          username,
          openAiApiKey
        );

        return report;
      } catch (error) {
        console.error('Error in createWeeklyReport:', error);
        if (error instanceof Error) {
          return `Error generating weekly report: ${error.message}`;
        }
        return 'Error generating weekly report: Unknown error';
      }
    }
  );
}

export { createWeeklyReport };
