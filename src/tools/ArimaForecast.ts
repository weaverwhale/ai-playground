import { z } from 'zod';
import { Tool } from './Tool';
import TimeseriesAnalysis from 'timeseries-analysis';

interface ModelMetrics {
  mse: number;
  rmse: number;
  mae: number;
  r2: number;
}

interface SeasonalityInfo {
  detected: boolean;
  period?: number;
  strength?: number;
}

function calculateMetrics(actual: number[], predicted: number[]): ModelMetrics {
  const n = actual.length;
  const mean = actual.reduce((a, b) => a + b) / n;

  // Calculate errors
  const errors = actual.map((val, i) => val - predicted[i]);
  const squaredErrors = errors.map((e) => e * e);
  const absoluteErrors = errors.map((e) => Math.abs(e));

  // Calculate metrics
  const mse = squaredErrors.reduce((a, b) => a + b) / n;
  const rmse = Math.sqrt(mse);
  const mae = absoluteErrors.reduce((a, b) => a + b) / n;

  // Calculate R-squared
  const totalSS = actual
    .map((val) => Math.pow(val - mean, 2))
    .reduce((a, b) => a + b);
  const r2 = 1 - squaredErrors.reduce((a, b) => a + b) / totalSS;

  return { mse, rmse, mae, r2 };
}

function detectSeasonality(data: number[]): SeasonalityInfo {
  const n = data.length;
  if (n < 4) return { detected: false };

  // Calculate autocorrelation for different lags
  const maxLag = Math.floor(n / 2);
  const correlations: number[] = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += (data[i] - data[i + lag]) ** 2;
      count++;
    }
    correlations.push(sum / count);
  }

  // Find the strongest seasonal period
  const minCorrelationIndex = correlations.indexOf(Math.min(...correlations));
  const seasonalStrength =
    1 - correlations[minCorrelationIndex] / correlations[0];

  return {
    detected: seasonalStrength > 0.3,
    period: minCorrelationIndex + 1,
    strength: seasonalStrength,
  };
}

function differenceData(data: number[], lag: number = 1): number[] {
  return data.slice(lag).map((val, i) => val - data[i]);
}

function testStationarity(data: number[]): boolean {
  // Augmented Dickey-Fuller test (simplified version)
  const diff = differenceData(data);
  const mean = diff.reduce((a, b) => a + b) / diff.length;
  const variance =
    diff.reduce((a, b) => a + Math.pow(b - mean, 2)) / diff.length;

  // If variance is very small relative to mean, consider it stationary
  return variance < Math.abs(mean) * 0.1;
}

function optimizeARIMAParameters(
  data: number[],
  seasonality: SeasonalityInfo
): {
  p: number;
  d: number;
  q: number;
  P?: number;
  D?: number;
  Q?: number;
  s?: number;
} {
  const isStationary = testStationarity(data);
  const d = isStationary ? 0 : 1;

  // Start with simple parameters
  let bestParams = { p: 1, d, q: 1 };
  let bestAIC = Infinity;

  // Grid search for best parameters
  for (let p = 0; p <= 2; p++) {
    for (let q = 0; q <= 2; q++) {
      try {
        const timeseries = new TimeseriesAnalysis(data.map((v, i) => [i, v]));
        timeseries.smoother({ period: p + 1 });

        // Calculate AIC (Akaike Information Criterion)
        const predictions = data.map((_, i) => timeseries.predict(i));
        const metrics = calculateMetrics(data, predictions);
        const k = p + q + (d > 0 ? 1 : 0); // number of parameters
        const aic = n * Math.log(metrics.mse) + 2 * k;

        if (aic < bestAIC) {
          bestAIC = aic;
          bestParams = { p, d, q };
        }
      } catch (e) {
        continue;
      }
    }
  }

  // Add seasonal parameters if seasonality detected
  if (seasonality.detected && seasonality.period) {
    return {
      ...bestParams,
      P: 1,
      D: 1,
      Q: 1,
      s: seasonality.period,
    };
  }

  return bestParams;
}

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
    autoOptimize: z
      .boolean()
      .default(true)
      .describe('Automatically optimize ARIMA parameters'),
  });

  return new Tool(
    paramsSchema,
    'arima_forecast',
    'Useful for forecasting future values based on time series data using ARIMA/SARIMA models',
    async ({ data, periods, interval, autoOptimize }) => {
      console.log('Forecasting with ARIMA for', periods, interval);

      try {
        // Analyze seasonality
        const seasonality = detectSeasonality(data);

        // Optimize parameters if requested
        const params = autoOptimize
          ? optimizeARIMAParameters(data, seasonality)
          : { p: 1, d: 1, q: 1 };

        // Create time series data with timestamps
        const timeData = data.map((value, index) => [index, value]);
        const timeseries = new TimeseriesAnalysis(timeData);

        // Apply differencing if needed
        if (params.d > 0) {
          timeseries.diff({ lag: 1, order: params.d });
        }

        // Apply seasonal differencing if needed
        if (params.D && params.s) {
          timeseries.diff({ lag: params.s, order: params.D });
        }

        // Generate forecast
        const forecast = [];
        const confidenceLow = [];
        const confidenceHigh = [];

        for (let i = 0; i < periods; i++) {
          const nextValue = timeseries.forecast();
          const stdError = Math.sqrt(timeseries.variance());

          forecast.push(Number(nextValue.toFixed(2)));
          confidenceLow.push(Number((nextValue - 1.96 * stdError).toFixed(2)));
          confidenceHigh.push(Number((nextValue + 1.96 * stdError).toFixed(2)));

          timeData.push([timeData.length, nextValue]);
          timeseries.setData(timeData);
        }

        // Calculate model performance metrics
        const trainingPredictions = data.map((_, i) => timeseries.predict(i));
        const metrics = calculateMetrics(data, trainingPredictions);

        return {
          forecast,
          confidenceIntervals: {
            lower: confidenceLow,
            upper: confidenceHigh,
          },
          modelInfo: {
            parameters: params,
            seasonality,
            metrics,
            isStationary: testStationarity(data),
          },
          interval,
          message: `
          Forecast for next ${periods} ${interval}: ${forecast.join(', ')}
          Model Performance: R² = ${metrics.r2.toFixed(3)}, RMSE = ${metrics.rmse.toFixed(3)}
          ${
            seasonality.detected
              ? `Seasonality detected with period ${seasonality.period}
          `
              : 'No significant seasonality detected'
          }`,
        };
      } catch (error) {
        return `Error: Could not generate forecast. ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  );
}

export { createArimaForecast };
