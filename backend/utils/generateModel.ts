import OpenAI from 'openai';

import { Model } from '../../shared/types';
import { gemini } from '../clients/gemini';
import { deepseek } from '../clients/deepseek';
import { cerebras } from '../clients/cerebras';
import { grok } from '../clients/grok';
import { qwen } from '../clients/qwen';
import { openai } from '../clients/openai';
import { groq } from '../clients/groq';

const clientMap = {
  gemini,
  deepseek,
  cerebras,
  grok,
  qwen,
  groq,
  openai,
};

export function generateModel(model: Model) {
  const client = clientMap[model.client] || openai;
  const isClientType = {
    isGemini: model.client === 'gemini',
    isDeepSeek: model.client === 'deepseek',
    isCerebras: model.client === 'cerebras',
    isGrok: model.client === 'grok',
    isQwen: model.client === 'qwen',
    isGroq: model.client === 'groq',
  };

  // coerce type to OpenAI as all of these return OpenAI-esque objects
  return { client: client as OpenAI, ...isClientType };
}
