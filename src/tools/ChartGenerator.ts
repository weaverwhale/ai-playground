import { z } from 'zod';
import { Tool } from './Tool';

function createChartGenerator() {
  const paramsSchema = z.object({
    type: z
      .enum(['line', 'bar', 'pie', 'gantt', 'sankey'])
      .describe('Type of chart to generate'),
    data: z
      .array(z.array(z.union([z.string(), z.number()])))
      .describe(
        'Array of data points. For line/bar: [[label, value], ...]. For pie: [[label, value], ...]. For sankey: [[source, target, value], ...]'
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
          case 'sankey':
            mermaidCode = generateSankeyChart(data);
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
  // Extract labels and values from data
  const labels = data.map(([x]) => x.toString());
  const values = data.map(([, y]) => Number(y));

  // Construct the chart string
  let chart = 'xychart-beta\n';

  if (title) {
    chart += `title "${title}"\n`;
  }

  // Add x-axis with labels
  chart += `x-axis "${xLabel || ''}" [${labels.map((l) => `"${l}"`).join(',')}]\n`;

  // Add y-axis
  chart += `y-axis "${yLabel || ''}" ${Math.min(...values)} --> ${Math.max(...values)}\n`;

  // Add line data
  chart += `line [${values.join(',')}]\n`;

  return chart;
}

function generateBarChart(
  data: Array<Array<string | number>>,
  title?: string,
  xLabel?: string,
  yLabel?: string
): string {
  // Extract labels and values from data
  const labels = data.map(([x]) => x.toString());
  const values = data.map(([, y]) => Number(y));

  // Determine Y-axis range
  const minY = 0;
  const maxY = Math.ceil(Math.max(...values) * 1.2); // Adding 20% padding

  // Construct the chart string
  let chart = 'xychart-beta\n';

  if (title) {
    chart += `title "${title}"\n`;
  }

  // Add x-axis with labels
  chart += `x-axis "${xLabel || ''}" [${labels.map((l) => `"${l}"`).join(',')}]\n`;

  // Add y-axis
  chart += `y-axis "${yLabel || ''}" ${minY} --> ${maxY}\n`;

  // Add bar data
  chart += `bar [${values.join(',')}]\n`;

  return chart;
}

function generatePieChart(
  data: Array<Array<string | number>>,
  title?: string
): string {
  let chart = 'pie\n';
  if (title) chart += `    title "${title}"\n`;

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
  if (title) chart += `    title "${title}"\n`;
  chart += '    dateFormat YYYY-MM-DD\n';

  data.forEach(([task, start, end]) => {
    chart += `    ${task} : ${start}, ${end}\n`;
  });

  return chart;
}

function generateSankeyChart(data: Array<Array<string | number>>): string {
  // Construct the chart string
  let chart = 'sankey-beta\n';

  // Add data rows (source, target, value)
  data.forEach(([source, target, value]) => {
    chart += `${source},${target},${value}\n`;
  });

  return chart;
}

export { createChartGenerator };
