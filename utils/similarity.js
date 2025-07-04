import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cache for embeddings
const embeddingCache = new Map();

export const getEmbedding = async (text) => {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text);
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  const embedding = response.data[0].embedding;
  embeddingCache.set(text, embedding);
  return embedding;
};

export const cosineSimilarity = (a, b) => {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));
  return dot / (magA * magB);
};

export const analyzeRiskWithGPT = async (controlDescription, riskRegister) => {
  const prompt = `
  You are a SOX ITGC risk assessment expert. Analyze this control description against the risk register:

  Control: "${controlDescription}"

  Available Risk Patterns:
  ${riskRegister.map(r => `[${r.id}] ${r.description} (Severity: ${r.severity})`).join('\n')}

  Instructions:
  1. Identify ALL matching risks (cosine similarity > 0.7)
  2. For ambiguous cases, ask clarifying questions
  3. Return JSON with matches and follow-up questions

  Response Format:
  {
    "matches": [{"id": "RISK-1", "confidence": 0.0-1.0}],
    "questions_needed": ["Is this for financial systems?", "What change control process exists?"]
  }`;

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content);
};