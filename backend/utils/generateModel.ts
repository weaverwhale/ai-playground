import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import { Groq } from 'groq-sdk';

import { Model } from '../../shared/types';
import { gemini } from '../clients/gemini';
import { deepseek } from '../clients/deepseek';
import { cerebras } from '../clients/cerebras';
import { grok } from '../clients/grok';
import { qwen } from '../clients/qwen';
import { openai } from '../clients/openai';
import { groq } from '../clients/groq';

const clientMap: Record<string, OpenAI | GoogleGenerativeAI | Groq | Cerebras> =
  {
    gemini,
    deepseek,
    cerebras,
    grok,
    qwen,
    groq,
    openai,
  };

export function generateOpenAIModel(model: Model) {
  const client = clientMap[model.client] || openai;
  const isClientType = {
    isGemini: model.client === 'gemini',
    isDeepSeek: model.client === 'deepseek',
    isCerebras: model.client === 'cerebras',
    isGrok: model.client === 'grok',
    isQwen: model.client === 'qwen',
    isGroq: model.client === 'groq',
  };

  return { client, ...isClientType };
}
