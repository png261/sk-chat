import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { tool as aiTool } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import type { CodexPetState } from 'codex-pet-web';
import type {
  SkChatMessage,
  SkChatContextSnapshot,
  SkChatAttachment,
  SkChatThread,
  SkChatProviderProps,
} from '../types';

export const DEFAULT_ENDPOINT = '/api/sk-chat';
export const DEFAULT_MEMORY_KEY = 'sk-chat';

export type NormalizedMemory = {
  type: 'local' | 'remote' | 'none';
  conversationId?: string;
};

export function normalizeMemory(
  memory: SkChatProviderProps['memory'],
  enableMemory: boolean | undefined,
): NormalizedMemory {
  if (memory === 'local' || memory === 'remote' || memory === 'none') {
    return { type: memory };
  }

  if (memory) return memory;

  return { type: enableMemory === false ? 'none' : ('local' as const) };
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isOpenAiCompatibleEndpoint(
  apiEndpoint: string,
  apiMode?: SkChatProviderProps['apiMode'],
) {
  if (apiMode) return apiMode === 'openai-compatible';
  return (
    /\/v1\/?$/.test(apiEndpoint) || /\/chat\/completions\/?$/.test(apiEndpoint)
  );
}

export function normalizeChatCompletionEndpoint(apiEndpoint: string) {
  return /\/chat\/completions\/?$/.test(apiEndpoint)
    ? apiEndpoint
    : `${apiEndpoint.replace(/\/$/, '')}/chat/completions`;
}

export function getOpenAiCompatibleContent(data: any) {
  return (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.delta?.content ||
    data?.message?.content ||
    data?.content ||
    ''
  );
}

export function getScreenshotByteSize(screenshot?: string) {
  if (!screenshot) return 0;
  const base64 = screenshot.split(',')[1] || screenshot;
  return Math.round((base64.length * 3) / 4);
}

export function getScreenshotMimeType(screenshot?: string) {
  return screenshot?.match(/^data:([^;]+);base64,/)?.[1];
}

export function toScreenshotDataUrl(screenshot?: string) {
  if (!screenshot) return undefined;
  if (screenshot.startsWith('data:')) return screenshot;
  return `data:image/png;base64,${screenshot}`;
}

export function stripReasoning(text: string): string {
  if (!text) return '';
  let clean = text;
  if (clean.includes('<think>')) {
    const thinkStart = clean.indexOf('<think>');
    const thinkEnd = clean.indexOf('</think>');
    if (thinkEnd !== -1) {
      clean = clean.slice(0, thinkStart) + clean.slice(thinkEnd + 8);
    } else {
      clean = clean.slice(0, thinkStart);
    }
  }
  return clean;
}

export function getUpdatedParts(
  textVal: string,
  reasoningVal: string,
  toolCalls: any[],
) {
  const parts: any[] = [];
  let cleanText = textVal;
  let reasoningText = reasoningVal;

  // Parse <think>...</think> from textVal if present
  if (textVal.includes('<think>')) {
    const thinkStart = textVal.indexOf('<think>');
    const thinkEnd = textVal.indexOf('</think>');
    if (thinkEnd !== -1) {
      reasoningText += textVal.slice(thinkStart + 7, thinkEnd);
      cleanText = textVal.slice(0, thinkStart) + textVal.slice(thinkEnd + 8);
    } else {
      reasoningText += textVal.slice(thinkStart + 7);
      cleanText = textVal.slice(0, thinkStart);
    }
  }

  if (reasoningText) {
    parts.push({ type: 'reasoning' as const, text: reasoningText });
  }
  parts.push({ type: 'text' as const, text: cleanText });
  if (toolCalls.length > 0) {
    parts.push(...toolCalls);
  }
  return { parts, cleanText };
}

export function supportsVision(modelName?: string): boolean {
  if (!modelName) return true; // Default to true if not specified
  const name = modelName.toLowerCase();
  if (name.includes('owl-alpha')) return false;
  return (
    name.includes('gpt-4o') ||
    name.includes('vision') ||
    name.includes('gemini') ||
    name.includes('claude-3') ||
    name.includes('pixtral') ||
    name.includes('qwen2.5-vl') ||
    name.includes('vl')
  );
}

export function formatUserContentWithScreenshot(
  msg: SkChatMessage,
  screenshotUrl: string | null,
  isVision = true,
) {
  if (msg.role !== 'user') return msg.content;

  const quoteText = msg.metadata?.custom?.quote?.text;
  const quotePrefix = quoteText ? `[Referring to: "${quoteText}"]\n\n` : '';
  const fullText = quotePrefix + msg.content;

  const attachments = msg.attachments || [];
  const imageAttachments = attachments.filter(
    (att) => att.type.startsWith('image/') && att.data,
  );

  if (!isVision) {
    let note = '';
    if (imageAttachments.length > 0 || screenshotUrl) {
      note = `\n\n[Note: Một hoặc nhiều hình ảnh (bao gồm ảnh chụp màn hình) đã được đính kèm vào tin nhắn này nhưng mô hình hiện tại không hỗ trợ đầu vào dạng ảnh (vision).]`;
    }
    return fullText + note;
  }

  if (imageAttachments.length === 0 && !screenshotUrl) {
    return fullText;
  }

  const content: any[] = [{ type: 'text', text: fullText }];
  for (const attachment of imageAttachments) {
    content.push({
      type: 'image_url',
      image_url: {
        url: attachment.data,
        detail: 'high',
      },
    });
  }
  if (screenshotUrl) {
    content.push({
      type: 'image_url',
      image_url: {
        url: screenshotUrl,
        detail: 'low',
      },
    });
  }
  return content;
}

export function createUserContentWithScreenshot(
  message: string,
  context: SkChatContextSnapshot,
  metadata?: Record<string, unknown>,
  attachments?: SkChatAttachment[],
) {
  const text = `${message}

Page URL: ${context.url || ''}
Metadata:
${JSON.stringify(metadata || {}, null, 2)}`;

  const content: any[] = [{ type: 'text', text }];

  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.type.startsWith('image/') && attachment.data) {
        content.push({
          type: 'image_url',
          image_url: {
            url: attachment.data,
            detail: 'high',
          },
        });
      }
    }
  }

  if (content.length === 1) {
    return text;
  }

  return content;
}

export async function readOpenAiCompatibleResponse(
  response: Response,
  onChunk: (chunk: string) => void,
  onToolCall?: (toolCalls: any[]) => void,
) {
  const contentType = response.headers.get('content-type') || '';

  if (!response.body || !contentType.includes('text/event-stream')) {
    const data = await response.json();
    onChunk(getOpenAiCompatibleContent(data));
    const message = data?.choices?.[0]?.message;
    if (message?.tool_calls && onToolCall) {
      onToolCall(message.tool_calls);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const payload = line.replace(/^data:\s*/, '');
      if (!payload || payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        onChunk(getOpenAiCompatibleContent(parsed));
        const delta =
          parsed?.choices?.[0]?.delta || parsed?.choices?.[0]?.message;
        if (delta?.tool_calls && onToolCall) {
          onToolCall(delta.tool_calls);
        }
      } catch {
        onChunk(payload);
      }
    }
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  const payload = buffer.trim().replace(/^data:\s*/, '');
  if (payload && payload !== '[DONE]') {
    try {
      const parsed = JSON.parse(payload);
      onChunk(getOpenAiCompatibleContent(parsed));
      const delta =
        parsed?.choices?.[0]?.delta || parsed?.choices?.[0]?.message;
      if (delta?.tool_calls && onToolCall) {
        onToolCall(delta.tool_calls);
      }
    } catch {
      onChunk(payload);
    }
  }
}

export async function readTextStream(
  response: Response,
  onChunk: (chunk: string) => void,
) {
  if (!response.body) {
    onChunk(await response.text());
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) onChunk(tail);
}

export function getAgentPetState(
  messages: SkChatMessage[],
  isLoading: boolean,
  error: Error | null,
): CodexPetState {
  if (error) {
    return 'failed';
  }

  if (!isLoading) {
    return 'idle';
  }

  if (messages.length === 0) {
    return 'review';
  }

  const lastMessage = messages[messages.length - 1];
  if (
    lastMessage.role === 'assistant' &&
    lastMessage.parts &&
    lastMessage.parts.length > 0
  ) {
    const runningToolCall = lastMessage.parts.find(
      (p) =>
        p.type === 'tool-call' &&
        (p.result === undefined || p.result === null),
    );
    if (runningToolCall && runningToolCall.type === 'tool-call') {
      return 'running';
    }

    const hasReasoning = lastMessage.parts.some((p) => p.type === 'reasoning');
    const textPart = lastMessage.parts.find((p) => p.type === 'text');
    const hasText = textPart && textPart.text && textPart.text.trim().length > 0;

    if (hasReasoning && !hasText) {
      return 'review';
    }

    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (lastPart.type === 'tool-call') {
      const hasResult = lastPart.result !== undefined && lastPart.result !== null;
      if (!hasResult) {
        return 'running';
      }
    } else if (lastPart.type === 'reasoning') {
      return 'review';
    }
  }

  return 'review';
}

export function getAgentSpeechText(
  messages: SkChatMessage[],
  isLoading: boolean,
): string {
  if (!isLoading) {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    return (
      lastAssistantMessage?.content ||
      'Xin chào! Mình có thể giúp gì cho bạn hôm nay?'
    );
  }

  if (messages.length === 0) {
    return 'Đang suy nghĩ...';
  }

  const lastMessage = messages[messages.length - 1];

  if (lastMessage.role === 'user') {
    return 'Đang suy nghĩ...';
  }

  if (
    lastMessage.role === 'assistant' &&
    lastMessage.parts &&
    lastMessage.parts.length > 0
  ) {
    const runningToolCall = lastMessage.parts.find(
      (p) =>
        p.type === 'tool-call' &&
        (p.result === undefined || p.result === null),
    );
    if (runningToolCall && runningToolCall.type === 'tool-call') {
      switch (runningToolCall.toolName) {
        case 'get_web_content':
          return 'Đang đọc nội dung trang web...';
        case 'screenshot':
          return 'Đang chụp ảnh màn hình...';
        case 'load_skill':
          return 'Đang kích hoạt kỹ năng...';
        default:
          return `Đang chạy công cụ: ${runningToolCall.toolName}...`;
      }
    }

    const hasReasoning = lastMessage.parts.some((p) => p.type === 'reasoning');
    const textPart = lastMessage.parts.find((p) => p.type === 'text');
    const hasText = textPart && textPart.text && textPart.text.trim().length > 0;

    if (hasReasoning && !hasText) {
      return 'Đang suy nghĩ...';
    }

    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (lastPart.type === 'tool-call') {
      const hasResult = lastPart.result !== undefined && lastPart.result !== null;
      if (!hasResult) {
        switch (lastPart.toolName) {
          case 'get_web_content':
            return 'Đang đọc nội dung trang web...';
          case 'screenshot':
            return 'Đang chụp ảnh màn hình...';
          case 'load_skill':
            return 'Đang kích hoạt kỹ năng...';
          default:
            return `Đang chạy công cụ: ${lastPart.toolName}...`;
        }
      }
    } else if (lastPart.type === 'reasoning') {
      return 'Đang suy nghĩ...';
    } else if (lastPart.type === 'text') {
      return lastPart.text || 'Đang trả lời...';
    }
  }

  return 'Đang suy nghĩ...';
}
