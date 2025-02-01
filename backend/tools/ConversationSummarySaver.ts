import { z } from 'zod';
import { Tool } from './Tool';

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createConversationSummarySaver() {
  const paramsSchema = z.object({
    title: z.string().describe('Title of the conversation'),
    markdown: z
      .string()
      .describe(
        'The contents of this conversation and summary, in markdown format'
      ),
  });

  return new Tool(
    paramsSchema,
    'conversation_summary_saver',
    'Useful for saving a summary of the conversation to a markdown file',
    async ({ title, markdown }) => {
      console.log('Saving conversation:', title);

      try {
        const conversationsDir = path.join(
          __dirname,
          '..',
          '..',
          'conversations'
        );

        // Create conversations directory if it doesn't exist
        await fs.mkdir(conversationsDir, { recursive: true });

        const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        const filePath = path.join(conversationsDir, fileName);

        await fs.writeFile(filePath, markdown, 'utf-8');
        const saved = `Conversation saved to ${fileName}`;
        console.log(saved);
        return saved;
      } catch (error) {
        console.error('Error saving conversation:', error);
        return 'Error: Could not save conversation';
      }
    }
  );
}

export { createConversationSummarySaver };
