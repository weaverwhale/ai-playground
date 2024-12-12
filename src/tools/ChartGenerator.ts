import { z } from 'zod';
import { Tool } from './Tool';

function createChartGenerator() {
  const paramsSchema = z.object({
    type: z
      .enum(['line', 'bar', 'pie', 'gantt'])
      .describe('Type of chart to generate'),
    data: z
      .array(z.array(z.union([z.string(), z.number()])))
      .describe(
        'Array of data points. For line/bar: [[label, value], ...]. For pie: [[label, value], ...]'
      ),
    title: z.string().optional().describe('Chart title'),
    xLabel: z.string().optional().describe('X-axis label'),
    yLabel: z.string().optional().describe('Y-axis label'),
  });

  return new Tool(
    paramsSchema,
    'chart_generator',
    'Useful for generating Mermaid charts from data',
    async ({ type, data, title, xLabel, yLabel }) => {
      try {
        let mermaidCode = '';

        switch (type) {
          case 'line':
            mermaidCode = generateLineChart(data, title, xLabel, yLabel);
            break;
          case 'bar':
            mermaidCode = generateBarChart(data, title, xLabel, yLabel);
            break;
          case 'pie':
            mermaidCode = generatePieChart(data, title);
            break;
          case 'gantt':
            mermaidCode = generateGanttChart(data, title);
            break;
        }

        // Return the mermaid code block without any extra spaces or newlines
        const result = `\`\`\`mermaid\n${mermaidCode.trim()}\n\`\`\``;

        console.log('ChartGenerator result:', result);

        return result;
      } catch (error) {
        throw new Error(
          `Could not generate chart: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
}

function generateLineChart(
  data: Array<Array<string | number>>,
  title?: string,
  xLabel?: string,
  yLabel?: string
): string {
  let chart = 'xychart-beta\n';
  if (title) chart += `title "${title}"\n`;

  // Create x-axis with label and values
  const labels = data.map(([x]) => `"${x}"`);
  chart += `x-axis [${labels.join(', ')}]\n`;

  // Calculate y-axis range
  const values = data.map(([, y]) => Number(y));
  const maxY = Math.max(...values);
  chart += `y-axis [0, ${Math.ceil(maxY * 1.2)}]\n`;

  // Add axis labels if provided
  if (xLabel) chart += `x-label "${xLabel}"\n`;
  if (yLabel) chart += `y-label "${yLabel}"\n`;

  // Add data points
  chart += 'line\n';
  data.forEach(([x, y]) => {
    chart += `    "${x}" ${y}\n`;
  });

  return chart;
}

function generateBarChart(
  data: Array<Array<string | number>>,
  title?: string,
  xLabel?: string,
  yLabel?: string
): string {
  let chart = 'xychart-beta\n';
  if (title) chart += `title "${title}"\n`;

  // Create x-axis with label and values
  const labels = data.map(([x]) => `"${x}"`);
  chart += `x-axis [${labels.join(', ')}]\n`;

  // Calculate y-axis range
  const values = data.map(([, y]) => Number(y));
  const maxY = Math.max(...values);
  chart += `y-axis [0, ${Math.ceil(maxY * 1.2)}]\n`;

  // Add axis labels if provided
  if (xLabel) chart += `x-label "${xLabel}"\n`;
  if (yLabel) chart += `y-label "${yLabel}"\n`;

  // Add data points
  chart += 'bar\n';
  data.forEach(([x, y]) => {
    chart += `    "${x}" ${y}\n`;
  });

  return chart;
}

function generatePieChart(
  data: Array<Array<string | number>>,
  title?: string
): string {
  let chart = 'pie\n';
  if (title) chart += `    title ${title}\n`;

  data.forEach(([label, value]) => {
    chart += `    "${label}" : ${value}\n`;
  });

  return chart;
}

function generateGanttChart(
  data: Array<Array<string | number>>,
  title?: string
): string {
  let chart = 'gantt\n';
  if (title) chart += `    title ${title}\n`;
  chart += '    dateFormat YYYY-MM-DD\n';

  data.forEach(([task, start, end]) => {
    chart += `    ${task} : ${start}, ${end}\n`;
  });

  return chart;
}

export { createChartGenerator };
