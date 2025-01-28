import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { runFirstStream } from './utils';

const app = express();
app.use(
  cors({
    origin: '*',
  })
);

app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ limit: '2mb', extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

app.post('/api/chat', async (req, res) => {
  const { messages, modelName } = req.body;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    try {
      await runFirstStream(modelName, messages, res);
    } catch (streamError) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          content: `Error during streaming: ${streamError.message || 'Unknown streaming error'}`,
        })}\n\n`
      );
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error:', error);
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        content: `Error: ${error.message || 'Something went wrong. Please try again.'}`,
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('/healthcheck', (_, res) => {
  res.sendStatus(200);
});

// Handle all other routes by serving the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.VITE_SERVER_PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
