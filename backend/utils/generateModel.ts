import OpenAI from 'openai';
import { Model } from '../../shared/types';
import { gemini } from '../clients/gemini';
import { deepseek } from '../clients/deepseek';
import { cerebras } from '../clients/cerebras';
import { grok } from '../clients/grok';
import { qwen } from '../clients/qwen';
import { openai } from '../clients/openai';

export function generateOpenAIModel(model: Model) {
  const isGemini = model.client === 'gemini';
  const isDeepSeek = model.client === 'deepseek';
  const isCerebras = model.client === 'cerebras';
  const isGrok = model.client === 'grok';
  const isQwen = model.client === 'qwen';
  const client = (
    isGemini
      ? gemini
      : isDeepSeek
        ? deepseek
        : isCerebras
          ? cerebras
          : isGrok
            ? grok
            : isQwen
              ? qwen
              : openai
  ) as OpenAI;

  return { client, isGemini, isDeepSeek, isCerebras, isGrok, isQwen };
}
