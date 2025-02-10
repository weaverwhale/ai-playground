import { z } from 'zod';
import { Tool } from './Tool';
import dotenv from 'dotenv';
import { v4 as uuidV4 } from 'uuid';

dotenv.config();

const TW_TOKEN = process.env.TW_TOKEN;
const TW_BEARER_TOKEN = process.env.TW_BEARER_TOKEN;
const IS_ON_VPN = process.env.IS_ON_VPN === 'true';
const IS_LOCAL = process.env.IS_LOCAL === 'true';
const IS_ORCABASE = process.env.IS_ORCABASE === 'true';

const MOBY_TLD = IS_LOCAL
  ? 'http://localhost'
  : IS_ON_VPN
    ? 'http://willy.srv.whale3.io'
    : 'https://app.triplewhale.com/api/v2';

const MOBY_ENDPOINT = IS_ORCABASE
  ? `${MOBY_TLD}/orcabase/moby`
  : `${MOBY_TLD}/willy/answer-nlq-question`;

function createMoby() {
  const paramsSchema = z.object({
    question: z
      .string()
      .describe('Question to ask Triple Whale Moby')
      .default('What is triple whale?'),
    shopId: z
      .string()
      .optional()
      .describe('Shopify store URL')
      .default('madisonbraids.myshopify.com'),
    parentMessageId: z
      .string()
      .optional()
      .describe('Parent message ID for conversation context'),
  });

  return new Tool(
    paramsSchema,
    'moby',
    "Useful for getting e-commerce analytics and insights from Triple Whale's AI, Moby.",
    async ({ question, shopId, parentMessageId }) => {
      console.log('Asking Moby:', question, shopId);

      if (!TW_BEARER_TOKEN && !TW_TOKEN && !IS_ON_VPN) {
        return 'Error: Triple Whale token or VPN not configured. ';
      }

      try {
        const response = await fetch(MOBY_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(TW_BEARER_TOKEN || IS_LOCAL
              ? { Authorization: `Bearer ${TW_BEARER_TOKEN}` }
              : IS_ON_VPN
                ? {}
                : { 'x-api-key': TW_TOKEN || '' }),
          },
          body: JSON.stringify({
            stream: false,
            shopId: shopId,
            conversationId: (parentMessageId || uuidV4()).toString(),
            source: 'chat',
            dialect: 'clickhouse',
            userId: 'test-user',
            additionalShopIds: [],
            question: question,
            query: question,
            generateInsights: true,
            isOutsideMainChat: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const lastMessageText =
          data.messages?.[data.messages.length - 1]?.text + ' ';

        return lastMessageText || 'No answer received from Moby. ';
      } catch (error) {
        console.error('Error querying Moby:', error);
        return 'Error: Could not fetch response from Triple Whale. ';
      }
    }
  );
}

export { createMoby };
