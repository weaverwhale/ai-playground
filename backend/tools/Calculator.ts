import { z } from 'zod';
import { Tool } from './Tool';

function createCalculator() {
  const paramsSchema = z.object({
    expression: z.string().describe('The mathematical expression to evaluate'),
  });

  return new Tool(
    paramsSchema,
    'calculator',
    'Useful for performing mathematical calculations',
    async ({ expression }) => {
      console.log('Calculating:', expression);
      try {
        // Using Function constructor for safe evaluation
        const sanitizedExpression = expression.replace(/[^0-9+\-*/().]/g, '');
        const result = new Function(`return ${sanitizedExpression}`)();
        return `${result}`;
      } catch {
        return 'Error: Invalid mathematical expression';
      }
    }
  );
}

export { createCalculator };
