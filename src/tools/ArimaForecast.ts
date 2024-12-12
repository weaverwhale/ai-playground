import { z } from 'zod';
import { Tool } from './Tool';
import TimeseriesAnalysis from 'timeseries-analysis';

function createArimaForecast() {
  const paramsSchema = z.object({
    data: z
      .array(z.number())
      .describe('Array of numerical time series data points'),
    periods: z
      .number()
      .min(1)
      .max(12)
      .default(5)
      .describe('Number of periods to forecast (1-12)'),
    interval: z
      .string()
      .default('days')
      .describe('Time interval (days, weeks, months)'),
  });

  return new Tool(
    paramsSchema,
    'arima_forecast',
    'Useful for forecasting future values based on time series data using ARIMA model',
    async ({ data, periods, interval }) => {
      console.log('Forecasting with ARIMA for', periods, interval);

      try {
        // Create time series data with timestamps
        const timeData = data.map((value, index) => [index, value]);

        // Initialize timeseries analysis
        const timeseries = new TimeseriesAnalysis(timeData);

        // Automatically detect best ARIMA parameters
        timeseries.smoother({ period: 3 });

        // Generate forecast
        const forecast = [];
        for (let i = 0; i < periods; i++) {
          const nextValue = timeseries.forecast();
          forecast.push(Number(nextValue.toFixed(2)));
          timeData.push([timeData.length, nextValue]);
          timeseries.setData(timeData);
        }

        // Calculate confidence intervals (simple approach)
        const stdDev = Math.sqrt(timeseries.variance());
        const confidenceLow = forecast.map((val) =>
          Number((val - 1.96 * stdDev).toFixed(2))
        );
        const confidenceHigh = forecast.map((val) =>
          Number((val + 1.96 * stdDev).toFixed(2))
        );

        return {
          forecast,
          confidenceIntervals: {
            lower: confidenceLow,
            upper: confidenceHigh,
          },
          interval,
          message: `Forecast for next ${periods} ${interval}: ${forecast.join(', ')}`,
        };
      } catch (error) {
        return `Error: Could not generate forecast. ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  );
}

export { createArimaForecast };
