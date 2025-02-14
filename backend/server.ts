import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { fileManager } from './clients/gemini';
import { Request, Response } from 'express';
import fs from 'fs/promises';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { runFirstStream } from './utils/stream';

const app = express();
app.use(
  cors({
    origin: '*',
  })
);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

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

const upload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
  },
});

interface MulterRequest {
  file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}

app.post(
  '/api/upload',
  upload.single('file'),
  async (req: Request & MulterRequest, res: Response) => {
    const file = req.file;
    let tempFilePath: string | null = null;

    try {
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      if (
        !file.mimetype.startsWith('image/') &&
        !file.mimetype.startsWith('video/')
      ) {
        res
          .status(400)
          .json({ error: 'Only image or video files are supported' });
        return;
      }

      // Create temporary file
      const tempFileName = `temp_${Date.now()}_${file.originalname}`;
      tempFilePath = path.join(os.tmpdir(), tempFileName);
      await fs.writeFile(tempFilePath, file.buffer);

      const uploadResponse = await fileManager.uploadFile(tempFilePath, {
        displayName: file.originalname,
        mimeType: file.mimetype,
      });

      res.json({
        fileUri: uploadResponse.file.uri,
        displayName: uploadResponse.file.displayName,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      console.error('Error processing file with Gemini:', error);
      res.status(500).json({ error: 'Failed to process file' });
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (error) {
          console.error('Error cleaning up temporary file:', error);
        }
      }
    }
  }
);

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
