import { AVAILABLE_CHAT_MODELS, DEFAULT_CHAT_MODEL_NAME } from '@/Oracle_Config';

let currentModel: string = DEFAULT_CHAT_MODEL_NAME;

export function getCurrentModel(): string {
  return currentModel;
}

export function setCurrentModel(model: string): void {
  if (!AVAILABLE_CHAT_MODELS.includes(model)) {
    throw new Error('Model not in AVAILABLE_CHAT_MODELS');
  }
  currentModel = model;
}

export function listModels(): string[] {
  return AVAILABLE_CHAT_MODELS;
}


