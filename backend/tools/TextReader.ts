import { z } from 'zod';
import { Tool } from './Tool';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Define your text file URLs here
const TEXT_URLS = [
  // { url: '/texts/OnboardingGuide.txt', type: 'text' },
  { url: '/texts/OnboardingGuide.html', type: 'html' },
];

class TextStore {
  private documents: { text: string; embedding: number[]; source: string }[] =
    [];
  private initialized = false;

  async initialize(openai: OpenAI) {
    if (this.initialized) return;

    try {
      console.log(`Loading ${TEXT_URLS.length} files...`);

      for (const file of TEXT_URLS) {
        const response = await fetch(file.url);
        const content = await response.text();
        const text = file.type === 'html' ? this.stripHtml(content) : content;
        await this.processText(text, file.url, openai);
      }

      console.log(`Successfully loaded ${this.documents.length} text chunks`);
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing text store:', error);
    }
  }

  private async processText(text: string, source: string, openai: OpenAI) {
    const chunks = this.splitIntoChunks(text, 1000);

    for (const chunk of chunks) {
      if (chunk.trim().length > 0) {
        const embedding = await this.createEmbedding(chunk, openai);
        this.documents.push({
          text: chunk,
          embedding,
          source: source,
        });
      }
    }
  }

  private splitIntoChunks(text: string, maxLength: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());

    return chunks;
  }

  async addDocument(text: string, openai: OpenAI) {
    const embedding = await this.createEmbedding(text, openai);
    this.documents.push({ text, embedding, source: '' });
  }

  async findSimilar(
    query: string,
    openai: OpenAI,
    limit = 3
  ): Promise<{ text: string; source: string }[]> {
    const queryEmbedding = await this.createEmbedding(query, openai);

    const scored = this.documents.map((doc) => ({
      text: doc.text,
      source: doc.source,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async createEmbedding(text: string, openai: OpenAI) {
    const response = await openai.embeddings.create({
      input: text,
      model: 'text-embedding-3-small',
    });
    return response.data[0].embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private stripHtml(html: string): string {
    // Remove scripts and style elements
    html = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    );
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Replace common block elements with newlines
    html = html.replace(
      /<\/(div|p|section|article|header|footer|main|aside|nav)>/gi,
      '\n'
    );

    // Remove all remaining HTML tags
    html = html.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace
    return html
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

const textStore = new TextStore();

// Initialize the text store immediately
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
textStore
  .initialize(openai)
  .then(() => {
    console.log('Text store initialized');
  })
  .catch((error) => {
    console.error('Failed to initialize text store:', error);
  });

function createTextReader() {
  const paramsSchema = z.object({
    query: z.string().describe('The question or query about the text contents'),
  });

  return new Tool(
    paramsSchema,
    'text_reader',
    'Useful for querying information from the pre-loaded text documents, including documentations, FAQs, and more.',
    async ({ query }) => {
      try {
        const results = await textStore.findSimilar(query, openai);
        return results
          .map((doc) => `Source: ${doc.source}\nContent: ${doc.text}`)
          .join('\n\n');
      } catch (error) {
        console.error('Text query error:', error);
        return 'Error querying text documents';
      }
    }
  );
}

export { createTextReader };
