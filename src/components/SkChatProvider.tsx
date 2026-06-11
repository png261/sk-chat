import {
  PropsWithChildren,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { CodexPetProvider, CodexPet, type CodexPetHandle } from 'codex-pet-web-react';
import type { CodexPetState } from 'codex-pet-web';
import { SkChatSidebar } from './ChatSidebar';
import { SkChatContext } from '../hooks/useSkChat';
import { captureElement } from '../utils/captureElement';
import { fileToAttachment } from '../utils/fileToAttachment';
import { htmlToMarkdown } from '../utils/htmlToMarkdown';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { tool as aiTool } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { cn } from '../utils/utils';
import { DEFAULT_SYSTEM_PROMPT } from '../prompts';
import { buildSkillsPrompt, DEFAULT_SK_CHAT_SKILLS } from '../skills';
import type {
  SkChatAttachment,
  SkChatContextSnapshot,
  SkChatMessage,
  SkChatProviderProps,
  SkChatRequest,
  SkChatValue,
  SkChatThread,
} from '../types';

const DEFAULT_ENDPOINT = '/api/sk-chat';
const DEFAULT_MEMORY_KEY = 'sk-chat';

type NormalizedMemory = {
  type: 'local' | 'remote' | 'none';
  conversationId?: string;
};

function normalizeMemory(
  memory: SkChatProviderProps['memory'],
  enableMemory: boolean | undefined,
): NormalizedMemory {
  if (memory === 'local' || memory === 'remote' || memory === 'none') {
    return { type: memory };
  }

  if (memory) return memory;

  return { type: enableMemory === false ? 'none' : 'local' as const };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isOpenAiCompatibleEndpoint(apiEndpoint: string, apiMode?: SkChatProviderProps['apiMode']) {
  if (apiMode) return apiMode === 'openai-compatible';
  return /\/v1\/?$/.test(apiEndpoint) || /\/chat\/completions\/?$/.test(apiEndpoint);
}

function normalizeChatCompletionEndpoint(apiEndpoint: string) {
  return /\/chat\/completions\/?$/.test(apiEndpoint)
    ? apiEndpoint
    : `${apiEndpoint.replace(/\/$/, '')}/chat/completions`;
}

function getOpenAiCompatibleContent(data: any) {
  return (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.delta?.content ||
    data?.message?.content ||
    data?.content ||
    ''
  );
}

function getScreenshotByteSize(screenshot?: string) {
  if (!screenshot) return 0;
  const base64 = screenshot.split(',')[1] || screenshot;
  return Math.round((base64.length * 3) / 4);
}

function getScreenshotMimeType(screenshot?: string) {
  return screenshot?.match(/^data:([^;]+);base64,/)?.[1];
}

function toScreenshotDataUrl(screenshot?: string) {
  if (!screenshot) return undefined;
  if (screenshot.startsWith('data:')) return screenshot;
  return `data:image/png;base64,${screenshot}`;
}

function stripReasoning(text: string): string {
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

function getUpdatedParts(textVal: string, reasoningVal: string, toolCalls: any[]) {
  const parts: any[] = [];
  let cleanText = textVal;
  let reasoningText = reasoningVal;

  // Parse <think>...</think> from textVal if present (e.g. from models streaming reasoning inside text)
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

function supportsVision(modelName?: string): boolean {
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

function formatUserContentWithScreenshot(msg: SkChatMessage, screenshotUrl: string | null, isVision = true) {
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
        detail: 'low', // Low detail is perfect for screenshots and uses only 85 tokens!
      },
    });
  }
  return content;
}

function createUserContentWithScreenshot(
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

async function readOpenAiCompatibleResponse(
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
        const delta = parsed?.choices?.[0]?.delta || parsed?.choices?.[0]?.message;
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
      const delta = parsed?.choices?.[0]?.delta || parsed?.choices?.[0]?.message;
      if (delta?.tool_calls && onToolCall) {
        onToolCall(delta.tool_calls);
      }
    } catch {
      onChunk(payload);
    }
  }
}

async function readTextStream(response: Response, onChunk: (chunk: string) => void) {
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

function getAgentPetState(
  messages: SkChatMessage[],
  isLoading: boolean,
  error: Error | null
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
  if (lastMessage.role === 'assistant' && lastMessage.parts && lastMessage.parts.length > 0) {
    // 1. Check if any tool call is currently running (i.e. has no result)
    const runningToolCall = lastMessage.parts.find(
      (p) => p.type === 'tool-call' && (p.result === undefined || p.result === null)
    );
    if (runningToolCall && runningToolCall.type === 'tool-call') {
      if (runningToolCall.toolName === 'ask_user') {
        return 'waiting';
      }
      return 'running';
    }

    // 2. Check if reasoning is active and no actual response text has been output yet
    const hasReasoning = lastMessage.parts.some((p) => p.type === 'reasoning');
    const textPart = lastMessage.parts.find((p) => p.type === 'text');
    const hasText = textPart && textPart.text && textPart.text.trim().length > 0;

    if (hasReasoning && !hasText) {
      return 'review';
    }

    // 3. Fallback to check the last part
    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (lastPart.type === 'tool-call') {
      const hasResult = lastPart.result !== undefined && lastPart.result !== null;
      if (!hasResult) {
        if (lastPart.toolName === 'ask_user') {
          return 'waiting';
        }
        return 'running';
      }
    } else if (lastPart.type === 'reasoning') {
      return 'review';
    }
  }

  return 'review';
}

function getAgentSpeechText(
  messages: SkChatMessage[],
  isLoading: boolean
): string {
  if (!isLoading) {
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
    return lastAssistantMessage?.content || 'Xin chào! Mình có thể giúp gì cho bạn hôm nay?';
  }

  if (messages.length === 0) {
    return 'Đang suy nghĩ...';
  }

  const lastMessage = messages[messages.length - 1];
  
  if (lastMessage.role === 'user') {
    return 'Đang suy nghĩ...';
  }

  if (lastMessage.role === 'assistant' && lastMessage.parts && lastMessage.parts.length > 0) {
    // 1. Check if any tool call is currently running (i.e. has no result)
    const runningToolCall = lastMessage.parts.find(
      (p) => p.type === 'tool-call' && (p.result === undefined || p.result === null)
    );
    if (runningToolCall && runningToolCall.type === 'tool-call') {
      switch (runningToolCall.toolName) {
        case 'get_web_content':
          return 'Đang đọc nội dung trang web...';
        case 'computer':
          return 'Đang tương tác với màn hình...';
        case 'load_skill':
          return 'Đang kích hoạt kỹ năng...';
        case 'ask_user':
          return 'Đang chờ bạn trả lời...';
        default:
          return `Đang chạy công cụ: ${runningToolCall.toolName}...`;
      }
    }

    // 2. Check if reasoning is active and no actual response text has been output yet
    const hasReasoning = lastMessage.parts.some((p) => p.type === 'reasoning');
    const textPart = lastMessage.parts.find((p) => p.type === 'text');
    const hasText = textPart && textPart.text && textPart.text.trim().length > 0;

    if (hasReasoning && !hasText) {
      return 'Đang suy nghĩ...';
    }

    // 3. Fallback to check the last part
    const lastPart = lastMessage.parts[lastMessage.parts.length - 1];
    if (lastPart.type === 'tool-call') {
      const hasResult = lastPart.result !== undefined && lastPart.result !== null;
      if (!hasResult) {
        switch (lastPart.toolName) {
          case 'get_web_content':
            return 'Đang đọc nội dung trang web...';
          case 'computer':
            return 'Đang tương tác với màn hình...';
          case 'load_skill':
            return 'Đang kích hoạt kỹ năng...';
          case 'ask_user':
            return 'Đang chờ bạn trả lời...';
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

export function SkChatProvider({
  children,
  apiEndpoint = DEFAULT_ENDPOINT,
  apiKey,
  apiMode,
  provider,
  model,
  systemPrompt,
  metadata,
  enableScreenshot = true,
  enableMarkdownContext = true,
  enableFileUpload = true,
  enableMemory = true,
  skills = DEFAULT_SK_CHAT_SKILLS,
  memory,
  position = 'bottom-right',
  className,
  contentClassName,
  sidebarClassName,
  buttonClassName,
  title,
  placeholder,
  theme,
  debug = false,
  contentData,
  style: customStyle,
  customTools,
}: PropsWithChildren<SkChatProviderProps>) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const askUserResolverRef = useRef<{
    toolCallId: string;
    resolve: (value: string) => void;
  } | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [shareContext, setShareContext] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [contextSnapshot, setContextSnapshot] = useState<SkChatContextSnapshot>({});
  const [messages, setMessages] = useState<SkChatMessage[]>([]);
  const [attachments, setAttachments] = useState<SkChatAttachment[]>([]);
  const [selectedSkillName, setSelectedSkillName] = useState<string | undefined>();
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [canPortalControls, setCanPortalControls] = useState(false);
  
  const [guideCoords, setGuideCoords] = useState<{
    x: number;
    y: number;
    text: string;
    isClicking?: boolean;
    success?: boolean;
  } | null>(null);



  const [userMouse, setUserMouse] = useState<{
    x: number;
    y: number;
    hoveredElement: string;
  }>({ x: 0, y: 0, hoveredElement: 'none' });

  const guideResolverRef = useRef<(() => void) | null>(null);
  const guideSuccessRef = useRef<(() => void) | null>(null);



  useEffect(() => {
    if (typeof window === 'undefined') return;

    let throttleTimeout: any = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (throttleTimeout) return;
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;

        const element = contentRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const relativeY = e.clientY - rect.top;

        const elemWidth = Math.max(Math.ceil(rect.width), element.clientWidth, 1);
        const elemHeight = Math.max(Math.ceil(rect.height), element.clientHeight, 1);
        const maxElemDim = Math.max(elemWidth, elemHeight);
        const scale = maxElemDim > 1024 ? 1024 / maxElemDim : 1;

        const scaledX = Math.round(relativeX * scale);
        const scaledY = Math.round(relativeY * scale);

        const hoveredEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        let hoveredStr = 'none';
        if (hoveredEl) {
          const tagName = hoveredEl.tagName.toLowerCase();
          const idStr = hoveredEl.id ? `#${hoveredEl.id}` : '';
          const classStr = hoveredEl.className && typeof hoveredEl.className === 'string'
            ? `.${hoveredEl.className.trim().split(/\s+/).join('.')}`
            : '';
          const textSnippet = hoveredEl.textContent?.trim().slice(0, 50) || '';
          const textStr = textSnippet ? ` "${textSnippet}"` : '';
          hoveredStr = `<${tagName}${idStr}${classStr}>${textStr}`;
        }

        setUserMouse({
          x: scaledX,
          y: scaledY,
          hoveredElement: hoveredStr,
        });
      }, 100);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, []);

  const stopMessage = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (askUserResolverRef.current) {
      askUserResolverRef.current.resolve('User cancelled or stopped the message.');
      askUserResolverRef.current = null;
    }
    if (guideResolverRef.current) {
      guideResolverRef.current();
    }
  }, []);

  const submitUserResponse = useCallback((toolCallId: string, response: string) => {
    if (askUserResolverRef.current && askUserResolverRef.current.toolCallId === toolCallId) {
      askUserResolverRef.current.resolve(response);
      askUserResolverRef.current = null;
    }
  }, []);

  const coordsRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingActiveRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; buttonX: number; buttonY: number } | null>(null);
  const lastXRef = useRef<number>(0);
  const petRef = useRef<CodexPetHandle | null>(null);

  // Sync coords reset during render when isOpen changes
  const prevIsOpenRef = useRef(isOpen);
  if (prevIsOpenRef.current !== isOpen) {
    coordsRef.current = null;
    prevIsOpenRef.current = isOpen;
  }

  // Track previous isLoading to detect transitions
  const prevIsLoadingRef = useRef(isLoading);

  useEffect(() => {
    // If user is currently dragging, don't interrupt the dragging animation
    if (isDraggingActiveRef.current) return;

    if (error) {
      petRef.current?.setState('failed');
      prevIsLoadingRef.current = isLoading;
      return;
    }

    if (guideCoords) {
      // Let the guideCoords useEffect below manage states
      return;
    }

    if (isLoading && !prevIsLoadingRef.current) {
      // Transition false -> true: Play jumping animation, then return to review/running state
      const targetState = getAgentPetState(messages, true, null);
      petRef.current?.play('jumping', { loops: 1, returnTo: targetState });
    } else if (!isLoading && prevIsLoadingRef.current) {
      // Transition true -> false: Play waving animation on success, then return to idle
      petRef.current?.play('waving', { loops: 1, returnTo: 'idle' });
    } else {
      // Regular state updates while running/thinking
      const targetState = getAgentPetState(messages, isLoading, error);
      petRef.current?.setState(targetState);
    }

    prevIsLoadingRef.current = isLoading;
  }, [isLoading, error, messages, guideCoords]);

  const getHomeCoords = useCallback(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    
    const petWidth = 96;
    const petHeight = 104;
    
    let left = 0;
    let top = window.innerHeight - petHeight - 24;

    const sidebarWidth = 420; // default var(--sk-chat-sidebar-width, 420px)
    
    if (isOpen) {
      left = window.innerWidth - sidebarWidth - petWidth - 24;
    } else {
      if (position === 'bottom-left') {
        left = 24;
      } else {
        left = window.innerWidth - petWidth - 24;
      }
    }
    
    left = Math.min(Math.max(10, left), window.innerWidth - petWidth - 10);
    top = Math.min(Math.max(10, top), window.innerHeight - petHeight - 10);

    return { x: left, y: top };
  }, [isOpen, position]);

  const prevGuideCoordsRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (guideCoords) {
      const prev = prevGuideCoordsRef.current;
      let isMovingRight = true;
      if (prev) {
        isMovingRight = guideCoords.x > prev.x;
      } else {
        const petEl = document.querySelector('[aria-label="Virtual Pet"]')?.parentElement;
        if (petEl) {
          const rect = petEl.getBoundingClientRect();
          isMovingRight = guideCoords.x > rect.left;
        } else {
          isMovingRight = guideCoords.x > window.innerWidth / 2;
        }
      }
      petRef.current?.setState(isMovingRight ? 'running-right' : 'running-left');

      const timer = setTimeout(() => {
        petRef.current?.setState(guideCoords.success || guideCoords.isClicking ? 'idle' : 'waiting');
      }, 800); // 800ms match the position transition duration

      prevGuideCoordsRef.current = { x: guideCoords.x, y: guideCoords.y };
      return () => clearTimeout(timer);
    } else {
      const prev = prevGuideCoordsRef.current;
      if (prev) {
        const home = coordsRef.current || getHomeCoords();
        const isMovingRight = home.x > prev.x;
        petRef.current?.setState(isMovingRight ? 'running-right' : 'running-left');

        const timer = setTimeout(() => {
          petRef.current?.setState('idle');
        }, 800);

        prevGuideCoordsRef.current = null;
        return () => clearTimeout(timer);
      }
      prevGuideCoordsRef.current = null;
    }
  }, [guideCoords, getHomeCoords]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only drag on left click

    isDraggingRef.current = false;
    isDraggingActiveRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      buttonX: coordsRef.current ? coordsRef.current.x : rect.left,
      buttonY: coordsRef.current ? coordsRef.current.y : rect.top,
    };
    lastXRef.current = e.clientX;

    petRef.current?.setState('idle');

    // Update cursor styling directly
    e.currentTarget.classList.remove('cursor-grab');
    e.currentTarget.classList.add('cursor-grabbing');

    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !isDraggingActiveRef.current) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      isDraggingRef.current = true;
    }

    if (isDraggingRef.current) {
      const nextX = dragStartRef.current.buttonX + dx;
      const nextY = dragStartRef.current.buttonY + dy;

      const rect = e.currentTarget.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 10;
      const maxY = window.innerHeight - rect.height - 10;
      const x = Math.min(Math.max(10, nextX), maxX);
      const y = Math.min(Math.max(10, nextY), maxY);

      coordsRef.current = { x, y };

      // Apply style directly for smooth 60fps rendering without React overhead
      e.currentTarget.style.left = `${x}px`;
      e.currentTarget.style.top = `${y}px`;
      e.currentTarget.style.bottom = 'auto';
      e.currentTarget.style.right = 'auto';
      e.currentTarget.style.transition = 'none';

      // Set state based on direction of movement relative to last pointer X position
      const pointerDeltaX = e.clientX - lastXRef.current;
      if (pointerDeltaX > 2) {
        petRef.current?.setState('running-right');
      } else if (pointerDeltaX < -2) {
        petRef.current?.setState('running-left');
      }

      lastXRef.current = e.clientX;
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    isDraggingActiveRef.current = false;

    // Reset cursor style
    e.currentTarget.classList.remove('cursor-grabbing');
    e.currentTarget.classList.add('cursor-grab');

    // Restore state based on agent status
    const targetState = getAgentPetState(messages, isLoading, error);
    petRef.current?.setState(targetState);
  }, [messages, isLoading, error]);

  const handleMouseEnterPet = useCallback(() => {
    if (guideCoords && guideSuccessRef.current) {
      guideSuccessRef.current();
    }
  }, [guideCoords]);



  const showGuide = useCallback(async (x: number, y: number, text: string, type: 'pointer' | 'text') => {
    const element = contentRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();

    // Calculate the scale factor between the actual element dimensions and the 1024px screenshot
    const elemWidth = Math.max(Math.ceil(rect.width), element.clientWidth, 1);
    const elemHeight = Math.max(Math.ceil(rect.height), element.clientHeight, 1);
    const maxElemDim = Math.max(elemWidth, elemHeight);

    const scale = maxElemDim > 1024 ? 1024 / maxElemDim : 1;

    // Scale the model's coordinates back to page pixel coordinates
    const actualX = x / scale;
    const actualY = y / scale;

    // Calculate absolute position on the document body
    const pageX = rect.left + window.scrollX + actualX;
    const pageY = rect.top + window.scrollY + actualY;

    window.scrollTo({
      top: Math.max(0, pageY - window.innerHeight / 2),
      left: Math.max(0, pageX - window.innerWidth / 2),
      behavior: 'smooth',
    });

    // Wait for smooth scroll to finish
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get fresh coordinates relative to viewport after scrolling
    const freshRect = element.getBoundingClientRect();
    const freshClientX = freshRect.left + actualX;
    const freshClientY = freshRect.top + actualY;

    setGuideCoords({ x: freshClientX, y: freshClientY, text, success: false });

    if (guideResolverRef.current) {
      guideResolverRef.current();
    }

    return new Promise<void>((resolve) => {
      let resolved = false;

      const resolveGuide = () => {
        if (resolved) return;
        resolved = true;

        setGuideCoords(null);
        guideResolverRef.current = null;
        guideSuccessRef.current = null;
        resolve();
      };

      const triggerSuccess = () => {
        if (resolved) return;
        resolved = true;

        // Show visual feedback (green dot)
        setGuideCoords((current) => current ? { ...current, success: true } : null);

        setTimeout(() => {
          setGuideCoords(null);
          guideResolverRef.current = null;
          guideSuccessRef.current = null;
          resolve();
        }, 500);
      };

      guideResolverRef.current = resolveGuide;
      guideSuccessRef.current = triggerSuccess;
    });
  }, []);

  const findInteractiveElement = useCallback((clientX: number, clientY: number, radius = 25): HTMLElement | null => {
    // 1. Check direct hit
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (el) {
      const interactiveAncestor = el.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]') as HTMLElement | null;
      if (interactiveAncestor) return interactiveAncestor;
      
      const style = window.getComputedStyle(el);
      if (style.cursor === 'pointer') return el;
    }

    // 2. Scan neighborhood
    let closestEl: HTMLElement | null = null;
    let minDistance = Infinity;

    for (let dx = -radius; dx <= radius; dx += 5) {
      for (let dy = -radius; dy <= radius; dy += 5) {
        const x = clientX + dx;
        const y = clientY + dy;
        const target = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!target) continue;

        const interactive = target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]') as HTMLElement | null;
        if (interactive) {
          const rect = interactive.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const dist = Math.sqrt(Math.pow(centerX - clientX, 2) + Math.pow(centerY - clientY, 2));
          if (dist < minDistance) {
            minDistance = dist;
            closestEl = interactive;
          }
        } else {
          const style = window.getComputedStyle(target);
          if (style.cursor === 'pointer') {
            const rect = target.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.sqrt(Math.pow(centerX - clientX, 2) + Math.pow(centerY - clientY, 2));
            if (dist < minDistance) {
              minDistance = dist;
              closestEl = target;
            }
          }
        }
      }
    }

    return closestEl || el;
  }, []);

  const moveAndInteract = useCallback(async (
    action: 'mouse_move' | 'left_click' | 'right_click' | 'double_click' | 'type',
    coordinate?: number[],
    text?: string
  ) => {
    if (!coordinate || !Array.isArray(coordinate) || coordinate.length < 2) {
      return 'Missing coordinates.';
    }
    const [x, y] = coordinate;
    const element = contentRef.current;
    if (!element) return 'Container element not found.';

    const rect = element.getBoundingClientRect();
    const elemWidth = Math.max(Math.ceil(rect.width), element.clientWidth, 1);
    const elemHeight = Math.max(Math.ceil(rect.height), element.clientHeight, 1);
    const maxElemDim = Math.max(elemWidth, elemHeight);

    const scale = maxElemDim > 1024 ? 1024 / maxElemDim : 1;

    // Scale back to element-relative page coordinates
    const actualX = x / scale;
    const actualY = y / scale;

    // Calculate document-relative coordinates
    const pageX = rect.left + window.scrollX + actualX;
    const pageY = rect.top + window.scrollY + actualY;

    // Smooth scroll the target to viewport center if needed
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clientX = rect.left + actualX;
    const clientY = rect.top + actualY;

    const isVisible = clientX >= 0 && clientX <= viewportWidth && clientY >= 0 && clientY <= viewportHeight;
    if (!isVisible) {
      window.scrollTo({
        top: Math.max(0, pageY - viewportHeight / 2),
        left: Math.max(0, pageX - viewportWidth / 2),
        behavior: 'smooth',
      });
      // Wait for smooth scroll
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    // Get fresh rect after scroll
    const freshRect = element.getBoundingClientRect();
    const freshClientX = freshRect.left + actualX;
    const freshClientY = freshRect.top + actualY;

    // Find the element at target coordinates (precision snapping!)
    const targetElement = findInteractiveElement(freshClientX, freshClientY);
    if (!targetElement) {
      return `Mouse moved to coordinates (${x}, ${y}), but no DOM element was found at that position.`;
    }

    // Snap cursor position to the center of the target element!
    const targetRect = targetElement.getBoundingClientRect();
    const targetClientX = targetRect.left + targetRect.width / 2;
    const targetClientY = targetRect.top + targetRect.height / 2;

    // Show pet standing near the target element and pointing to it
    const descText = action === 'left_click' || action === 'double_click'
      ? 'Đang click tại đây...'
      : (action === 'type' ? `Đang nhập "${text}" tại đây...` : 'Đang di chuyển tới đây...');

    setGuideCoords({
      x: targetClientX,
      y: targetClientY,
      text: descText,
      isClicking: false,
    });

    // Wait for the transition to finish
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (action === 'mouse_move') {
      await new Promise<void>((resolve) => {
        let resolved = false;

        const resolveGuide = () => {
          if (resolved) return;
          resolved = true;

          setGuideCoords(null);
          guideResolverRef.current = null;
          guideSuccessRef.current = null;
          resolve();
        };

        const triggerSuccess = () => {
          if (resolved) return;
          resolved = true;

          setGuideCoords((current) => current ? { ...current, success: true } : null);

          setTimeout(() => {
            setGuideCoords(null);
            guideResolverRef.current = null;
            guideSuccessRef.current = null;
            resolve();
          }, 500);
        };

        guideResolverRef.current = resolveGuide;
        guideSuccessRef.current = triggerSuccess;
      });

      return `Mouse moved to element <${targetElement.tagName.toLowerCase()}> at coordinates (${x}, ${y}) and user hovered to confirm.`;
    }

    // Visual click indicator
    setGuideCoords(current => current ? { ...current, isClicking: true } : null);
    await new Promise((resolve) => setTimeout(resolve, 300)); // click down duration

    // Perform DOM actions
    if (action === 'left_click' || action === 'right_click' || action === 'double_click') {
      // Focus if possible
      targetElement.focus?.();

      const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 });
      const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 });
      targetElement.dispatchEvent(mousedown);
      targetElement.dispatchEvent(mouseup);

      if (action === 'left_click') {
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        targetElement.dispatchEvent(clickEvent);
        // Fallback for standard HTML clickables
        if (targetElement instanceof HTMLButtonElement || targetElement instanceof HTMLAnchorElement || targetElement.tagName === 'BUTTON' || targetElement.tagName === 'A') {
          targetElement.click?.();
        }
      } else if (action === 'double_click') {
        const clickEvent1 = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        const clickEvent2 = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        const dblclick = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window });
        targetElement.dispatchEvent(clickEvent1);
        targetElement.dispatchEvent(clickEvent2);
        targetElement.dispatchEvent(dblclick);
      } else if (action === 'right_click') {
        const contextmenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window });
        targetElement.dispatchEvent(contextmenu);
      }

      setGuideCoords(current => current ? { ...current, isClicking: false } : null);
      return `Clicked element <${targetElement.tagName.toLowerCase()}> at coordinates (${x}, ${y}).`;
    }

    if (action === 'type') {
      targetElement.focus?.();
      
      const inputElement = (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement)
        ? targetElement
        : (targetElement.querySelector('input, textarea') || targetElement.closest('input, textarea')) as HTMLInputElement | HTMLTextAreaElement | null;

      if (inputElement) {
        inputElement.focus();
        inputElement.value = text || '';
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        setGuideCoords(current => current ? { ...current, isClicking: false } : null);
        return `Typed text "${text}" into element <${inputElement.tagName.toLowerCase()}> at coordinates (${x}, ${y}).`;
      } else {
        if (targetElement.isContentEditable) {
          targetElement.textContent = text || '';
          targetElement.dispatchEvent(new Event('input', { bubbles: true }));
          setGuideCoords(current => current ? { ...current, isClicking: false } : null);
          return `Typed text "${text}" into contenteditable element at coordinates (${x}, ${y}).`;
        }
        setGuideCoords(current => current ? { ...current, isClicking: false } : null);
        return `Focused element <${targetElement.tagName.toLowerCase()}> at coordinates (${x}, ${y}), but it is not a text input.`;
      }
    }

    setGuideCoords(current => current ? { ...current, isClicking: false } : null);
    return 'Action completed.';
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    (window as any).__sk_chat_guide__ = {
      showPointer: async (x: number, y: number, text: string) => {
        await showGuide(x, y, text, 'pointer');
      },
      showTextGuide: async (x: number, y: number, text: string) => {
        await showGuide(x, y, text, 'text');
      },
      clear: () => {
        if (guideResolverRef.current) {
          guideResolverRef.current();
        } else {
          setGuideCoords(null);
        }
      },
    };
    return () => {
      delete (window as any).__sk_chat_guide__;
    };
  }, [showGuide]);

  const normalizedMemory = useMemo(() => normalizeMemory(memory, enableMemory), [enableMemory, memory]);

  const [threads, setThreads] = useState<SkChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const conversationId = activeThreadId;

  useEffect(() => {
    setCanPortalControls(typeof document !== 'undefined' && Boolean(document.body));
  }, []);

  // Initialize threads and activeThreadId on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (normalizedMemory.type === 'local') {
      try {
        const cachedThreads = window.localStorage.getItem('sk-chat:threads');
        const cachedActiveId = window.localStorage.getItem('sk-chat:active-thread-id');

        if (cachedThreads) {
          const parsedThreads = JSON.parse(cachedThreads) as SkChatThread[];
          setThreads(parsedThreads);

          if (cachedActiveId && parsedThreads.some((t) => t.id === cachedActiveId)) {
            setActiveThreadId(cachedActiveId);
          } else if (parsedThreads.length > 0) {
            setActiveThreadId(parsedThreads[0].id);
          } else {
            const defaultId = createId('thread');
            const defaultThread: SkChatThread = {
              id: defaultId,
              title: 'Cuộc trò chuyện mới',
              createdAt: new Date().toISOString(),
              url: window.location.href,
              pageTitle: document.title,
            };
            setThreads([defaultThread]);
            setActiveThreadId(defaultId);
          }
        } else {
          const defaultId = createId('thread');
          const defaultThread: SkChatThread = {
            id: defaultId,
            title: 'Cuộc trò chuyện mới',
            createdAt: new Date().toISOString(),
            url: window.location.href,
            pageTitle: document.title,
          };
          setThreads([defaultThread]);
          setActiveThreadId(defaultId);
        }
      } catch {
        const defaultId = createId('thread');
        const defaultThread: SkChatThread = {
          id: defaultId,
          title: 'Cuộc trò chuyện mới',
          createdAt: new Date().toISOString(),
          url: window.location.href,
          pageTitle: document.title,
        };
        setThreads([defaultThread]);
        setActiveThreadId(defaultId);
      }
    } else {
      const defaultId = createId('thread');
      const defaultThread: SkChatThread = {
        id: defaultId,
        title: 'Cuộc trò chuyện mới',
        createdAt: new Date().toISOString(),
        url: window.location.href,
        pageTitle: document.title,
      };
      setThreads([defaultThread]);
      setActiveThreadId(defaultId);
    }
  }, [normalizedMemory.type]);

  // Load messages when activeThreadId changes
  useEffect(() => {
    if (normalizedMemory.type !== 'local' || typeof window === 'undefined') return;
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    try {
      const cached = window.localStorage.getItem(`sk-chat:thread:messages:${activeThreadId}`);
      if (cached) {
        setMessages(JSON.parse(cached) as SkChatMessage[]);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [activeThreadId, normalizedMemory.type]);

  // Persist activeThreadId changes
  useEffect(() => {
    if (normalizedMemory.type !== 'local' || typeof window === 'undefined') return;
    if (activeThreadId) {
      window.localStorage.setItem('sk-chat:active-thread-id', activeThreadId);
    } else {
      window.localStorage.removeItem('sk-chat:active-thread-id');
    }
  }, [activeThreadId, normalizedMemory.type]);

  // Persist threads list changes
  useEffect(() => {
    if (normalizedMemory.type !== 'local' || typeof window === 'undefined') return;
    if (threads.length === 0) return;
    try {
      window.localStorage.setItem('sk-chat:threads', JSON.stringify(threads));
    } catch {
      // Ignore
    }
  }, [threads, normalizedMemory.type]);

  // Persist messages list changes for active thread
  useEffect(() => {
    if (normalizedMemory.type !== 'local' || typeof window === 'undefined' || !activeThreadId) return;
    try {
      window.localStorage.setItem(`sk-chat:thread:messages:${activeThreadId}`, JSON.stringify(messages));
    } catch {
      // Ignore
    }
  }, [messages, activeThreadId, normalizedMemory.type]);

  useEffect(() => {
    if (!selectedSkillName) return;
    if (skills.some((skill) => skill.name === selectedSkillName)) return;
    setSelectedSkillName(undefined);
  }, [selectedSkillName, skills]);

  const refreshContext = useCallback(async () => {
    const isDirectChatCompletion = isOpenAiCompatibleEndpoint(apiEndpoint, apiMode);
    if (isDirectChatCompletion || !shareContext) {
      setContextSnapshot({});
      return {};
    }

    const element = contentRef.current;
    const html = element?.innerHTML ?? '';
    const rect = element?.getBoundingClientRect();
    const debugInfo: NonNullable<SkChatContextSnapshot['debug']> = {
      capturedAt: new Date().toISOString(),
      elementFound: Boolean(element),
      htmlLength: html.length,
      markdownLength: 0,
      screenshotLength: 0,
      elementRect: rect
        ? {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            scrollWidth: element?.scrollWidth ?? 0,
            scrollHeight: element?.scrollHeight ?? 0,
          }
        : undefined,
    };
    const snapshot: SkChatContextSnapshot = {
      html,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      title: typeof document !== 'undefined' ? document.title : undefined,
      contentData,
      debug: debugInfo,
    };

    const tasks: Promise<void>[] = [];

    if (enableMarkdownContext) {
      tasks.push(
        Promise.resolve().then(() => {
          snapshot.markdown = htmlToMarkdown(html);
          debugInfo.markdownLength = snapshot.markdown.length;
        })
      );
    }

    if (enableScreenshot && element) {
      tasks.push(
        captureElement(element)
          .then((screenshot) => {
            snapshot.screenshot = screenshot;
            debugInfo.screenshotLength = screenshot.length;
          })
          .catch((cause) => {
            const message =
              cause instanceof Error ? cause.message : 'Cannot capture screenshot context';
            debugInfo.screenshotError = message;
            console.warn('sk-chat: cannot capture screenshot context', cause);
          })
      );
    }

    await Promise.all(tasks);

    if (debug) {
      console.groupCollapsed('sk-chat context snapshot');
      console.info('debug', snapshot.debug);
      console.info('html preview', html.slice(0, 1000));
      console.info('markdown preview', snapshot.markdown?.slice(0, 1000));
      console.info('has screenshot', Boolean(snapshot.screenshot));
      console.groupEnd();
    }

    setContextSnapshot(snapshot);
    return snapshot;
  }, [
    debug,
    enableMarkdownContext,
    enableScreenshot,
    contentData,
    apiEndpoint,
    apiMode,
    shareContext,
  ]);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const sendMessage = useCallback(
    async (
      message: string,
      nextAttachments = attachments,
      options?: { selectedSkillName?: string; metadata?: Record<string, any> },
    ) => {
      setIsLoading(true);
      setError(null);
      setLastUserMessage(message);
      const activeSkillName = options?.selectedSkillName ?? selectedSkillName;

      // Abort any active request first
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const isDirectChatCompletion = isOpenAiCompatibleEndpoint(apiEndpoint, apiMode);
      const context = (isDirectChatCompletion || !shareContext) ? {} : await refreshContext();
      const userMessage: SkChatMessage = {
        id: createId('user'),
        role: 'user',
        content: message,
        attachments: nextAttachments,
        metadata: {
          ...metadata,
          ...options?.metadata,
        },
        createdAt: new Date().toISOString(),
      };

      let activeMessages = [
        ...messages,
        userMessage
      ];

      clearAttachments();

      // Auto-title if it's the first message
      if (activeThreadId) {
        setThreads((current) =>
          current.map((t) => {
            if (t.id === activeThreadId && t.title === 'Cuộc trò chuyện mới') {
              const snippet = message.trim().slice(0, 30) + (message.length > 30 ? '...' : '');
              return { ...t, title: snippet || 'Cuộc trò chuyện mới' };
            }
            return t;
          })
        );
      }

      try {
        let runToolCalls = true;
        let loopCount = 0;
        while (runToolCalls) {
          console.log(`[SkChat] Entering loop iteration, loopCount=${loopCount}, runToolCalls=${runToolCalls}`);
          if (controller.signal.aborted) {
            console.log('[SkChat] Controller signal aborted. Breaking loop.');
            break;
          }

          if (loopCount > 0) {
            console.log('[SkChat] Waiting 1.5s between loops...');
            // Wait 1.5s between consecutive tool loop requests to avoid Requests Per Minute (RPM) rate limits
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          loopCount++;

          const assistantId = createId('assistant');
          console.log(`[SkChat] Appending new assistant message placeholder, id=${assistantId}`);
          setMessages([...activeMessages, {
            id: assistantId,
            role: 'assistant',
            content: '',
            parts: [{ type: 'text', text: '' }],
            createdAt: new Date().toISOString(),
          }]);

          const requestPreview: SkChatContextSnapshot['requestPreview'] = {
            endpoint: isDirectChatCompletion
              ? normalizeChatCompletionEndpoint(apiEndpoint)
              : apiEndpoint,
            mode: isDirectChatCompletion ? 'openai-compatible' : 'proxy',
            model,
            hasScreenshot: Boolean(context.screenshot),
            screenshotTransport: context.screenshot ? 'base64-data-url' : 'none',
            screenshotMimeType: getScreenshotMimeType(context.screenshot) || 'image/png',
            screenshotBytes: getScreenshotByteSize(context.screenshot),
            markdownLength: context.markdown?.length || 0,
            htmlLength: context.html?.length || 0,
            metadata,
          };
          setContextSnapshot((current) => ({
            ...current,
            requestPreview,
          }));

          // Find the latest screenshot URL from the history to inject into the user message context
          let latestScreenshotUrl: string | null = null;
          for (let i = activeMessages.length - 1; i >= 0; i--) {
            const msg = activeMessages[i];
            if (msg.parts && msg.parts.length > 0) {
              const toolCalls = msg.parts.filter((p) => p.type === 'tool-call');
              const screenshotCall = toolCalls.find(
                (tc) =>
                  tc.toolName === 'computer' &&
                  tc.args?.action === 'screenshot' &&
                  tc.result &&
                  tc.result.startsWith('data:image/')
              );
              if (screenshotCall) {
                latestScreenshotUrl = screenshotCall.result;
                break;
              }
            }
          }

          // Find the last user message index in activeMessages
          let lastUserMessageIdx = -1;
          for (let i = activeMessages.length - 1; i >= 0; i--) {
            if (activeMessages[i].role === 'user') {
              lastUserMessageIdx = i;
              break;
            }
          }

          // Format messages for OpenAI Chat Completion API
          const apiMessages: any[] = [];
          for (let i = 0; i < activeMessages.length; i++) {
            const msg = activeMessages[i];
            if (msg.role === 'system') continue;
            if (msg.parts && msg.parts.length > 0) {
              const toolCalls = msg.parts.filter((p) => p.type === 'tool-call');
              const textPart = msg.parts.find((p) => p.type === 'text');
              if (toolCalls.length > 0) {
                apiMessages.push({
                  role: 'assistant',
                  content: textPart ? textPart.text || null : null,
                  tool_calls: toolCalls.map((tc) => ({
                    id: tc.toolCallId,
                    type: 'function',
                    function: {
                      name: tc.toolName,
                      arguments: JSON.stringify(tc.args || {}),
                    },
                  })),
                });
                for (const tc of toolCalls) {
                  if (tc.result !== undefined) {
                    let contentValue = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result);

                    // For OpenAI API, screenshot tool content must be a simple text message.
                    // The actual image is injected into the user message context below so the model can visually see it.
                    if (tc.toolName === 'computer' && tc.args?.action === 'screenshot') {
                      contentValue = 'Screenshot captured successfully.';
                    }

                    apiMessages.push({
                      role: 'tool',
                      tool_call_id: tc.toolCallId,
                      name: tc.toolName,
                      content: contentValue,
                    });
                  }
                }
                continue;
              }
            }
            const isLastUser = (i === lastUserMessageIdx);
            apiMessages.push({
              role: msg.role,
              content: msg.role === 'user' 
                ? formatUserContentWithScreenshot(msg, isLastUser ? latestScreenshotUrl : null, supportsVision(model)) 
                : msg.content,
            });
          }

          const quoteText = options?.metadata?.custom?.quote?.text;
          const quotePrefix = quoteText ? `[Referring to: "${quoteText}"]\n\n` : '';

          const compiledSystemPrompt = [
            systemPrompt || DEFAULT_SYSTEM_PROMPT,
            `Thông tin ngữ cảnh người dùng:
- Tên người dùng: ${metadata?.userName || 'Người dùng'}
- Hành động hiện tại của người dùng: ${metadata?.userAction || metadata?.currentAction || metadata?.activity || metadata?.action || 'Đang xem trang bài học'}`,
            `Trạng thái con trỏ chuột & Thành phần hover của người dùng:
- Tọa độ con trỏ: x=${userMouse.x}, y=${userMouse.y} (tỷ lệ tương đối trên lưới ảnh chụp màn hình 1024px).
- Thành phần đang hover: ${userMouse.hoveredElement || 'Không có'}`
          ].filter(Boolean).join('\n\n');

          const body: SkChatRequest = {
            message: quotePrefix + message,
            conversationId,
            context,
            attachments: nextAttachments,
            skills,
            selectedSkillName: activeSkillName,
            metadata,
            history: messages
              .filter((item) => item.role !== 'system')
              .map((item) => {
                const itemQuoteText = item.metadata?.custom?.quote?.text;
                const itemQuotePrefix = itemQuoteText ? `[Referring to: "${itemQuoteText}"]\n\n` : '';
                return {
                  role: item.role,
                  content: item.role === 'user' ? itemQuotePrefix + item.content : item.content,
                };
              }),
            provider,
            model,
            systemPrompt: compiledSystemPrompt,
          };

          if (isDirectChatCompletion) {
            // Use AI SDK's streamText with createOpenAI for proper streaming
            const openai = createOpenAI({
              baseURL: apiEndpoint.replace(/\/$/, ''),
              apiKey: apiKey || '',
            });

            const streamResult = streamText({
              model: openai.chat(model || 'gpt-4o-mini'),
              abortSignal: controller.signal,
              maxOutputTokens: 4096,
              system: [
                compiledSystemPrompt,
                buildSkillsPrompt(skills),
                activeSkillName
                  ? `Selected skill: ${activeSkillName}. Load this skill before answering.`
                  : '',
              ].filter(Boolean).join('\n\n'),
              messages: (() => {
                // Build AI SDK format messages directly from activeMessages
                const sdkMessages: any[] = [];
                for (let i = 0; i < activeMessages.length; i++) {
                  const msg = activeMessages[i];
                  if (msg.role === 'system') continue;

                  // Handle assistant messages with tool calls
                  if (msg.parts && msg.parts.length > 0) {
                    const toolCalls = msg.parts.filter((p: any) => p.type === 'tool-call');
                    const textPart = msg.parts.find((p: any) => p.type === 'text');

                    if (toolCalls.length > 0) {
                      // Assistant message with tool calls
                      const tp = textPart as any;
                      sdkMessages.push({
                        role: 'assistant' as const,
                        content: [
                          ...(tp?.text ? [{ type: 'text' as const, text: String(tp.text) }] : []),
                          ...toolCalls.map((tc: any) => ({
                            type: 'tool-call' as const,
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            input: tc.args || {},
                          })),
                        ],
                      });
                      // Tool result messages
                      for (const rawTc of toolCalls) {
                        const tc = rawTc as any;
                        if (tc.result !== undefined) {
                          let outputValue = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result);
                          if (tc.toolName === 'computer' && tc.args?.action === 'screenshot') {
                            outputValue = 'Screenshot captured successfully.';
                          }
                          sdkMessages.push({
                            role: 'tool' as const,
                            content: [{
                              type: 'tool-result' as const,
                              toolCallId: tc.toolCallId,
                              toolName: tc.toolName,
                              output: {
                                type: 'text',
                                value: outputValue,
                              },
                            }],
                          });
                        }
                      }
                      continue;
                    }
                  }

                  if (msg.role === 'user') {
                    const isLastUser = (i === lastUserMessageIdx);
                    const content = formatUserContentWithScreenshot(msg, isLastUser ? latestScreenshotUrl : null, supportsVision(model));
                    if (Array.isArray(content)) {
                      sdkMessages.push({
                        role: 'user' as const,
                        content: content.map((part: any) => {
                          if (part.type === 'image_url' && part.image_url?.url) {
                            return { type: 'image' as const, image: part.image_url.url };
                          }
                          return part;
                        }),
                      });
                    } else {
                      sdkMessages.push({
                        role: 'user' as const,
                        content: String(content || ''),
                      });
                    }
                  } else {
                    sdkMessages.push({
                      role: msg.role as 'assistant',
                      content: msg.content != null ? String(msg.content) : '',
                    });
                  }
                }
                console.log('[SkChat] Mapped sdkMessages for streamText:', sdkMessages);
                return sdkMessages;
              })(),
              tools: (() => {
                const standardTools: Record<string, any> = {
                  computer: aiTool({
                    description: 'Interact with the screen by taking screenshots, clicking coordinates, typing text, or guiding the user.',
                    inputSchema: z.object({
                      action: z.enum(['screenshot', 'mouse_move', 'left_click', 'right_click', 'double_click', 'left_mouse_down', 'left_mouse_up', 'type', 'key', 'cursor_position']).describe('The action to perform.'),
                      coordinate: z.array(z.number()).optional().describe('The [x, y] coordinates.'),
                      text: z.string().optional().describe('The text to type or instruction.'),
                    }),
                  }),
                  get_web_content: aiTool({
                    description: 'Read the full text/markdown content of the current web page.',
                    inputSchema: z.object({}),
                  }),
                  ask_user: aiTool({
                    description: 'Ask the user a clarifying question with predefined options.',
                    inputSchema: z.object({
                      question: z.string().describe('The question to ask.'),
                      options: z.array(z.string()).describe('Options the user can select.'),
                    }),
                  }),
                  load_skill: aiTool({
                    description: 'Load specialized instructions for a learning skill by name.',
                    inputSchema: z.object({
                      name: z.string().describe('The skill name to load.'),
                    }),
                  }),
                };

                if (customTools) {
                  for (const [name, toolDef] of Object.entries(customTools)) {
                    standardTools[name] = aiTool({
                      description: toolDef.description,
                      inputSchema: toolDef.parameters instanceof z.ZodType
                        ? toolDef.parameters
                        : z.any(),
                    });
                  }
                }

                return standardTools;
              })(),
              toolChoice: 'auto',
              onError: (err) => {
                console.error('[SkChat] streamText onError callback:', err);
                const nextError = err instanceof Error ? err : new Error(String(err));
                setError(nextError);
                setMessages((current) =>
                  current.map((item) =>
                    item.id === assistantId
                      ? {
                          ...item,
                          content: nextError.message,
                          parts: [{ type: 'text', text: nextError.message }]
                        }
                      : item
                  )
                );
              }
            });

            // Process the stream
            const accumulatedToolCalls: any[] = [];
            let assistantText = '';
            let assistantReasoning = '';


            console.log('[SkChat] Initiating streamResult fullStream processing...');
            for await (const part of streamResult.fullStream) {
              if (controller.signal.aborted) {
                console.log('[SkChat] Stream aborted.');
                break;
              }

              if (part.type === 'text-delta') {
                assistantText += part.text;
                const { parts, cleanText } = getUpdatedParts(assistantText, assistantReasoning, accumulatedToolCalls);
                setMessages((current) =>
                  current.map((item) =>
                    item.id === assistantId
                      ? {
                          ...item,
                          content: cleanText,
                          parts,
                        }
                      : item
                  )
                );
              } else if (part.type === 'tool-call') {
                console.log('[SkChat] Stream received tool-call:', part);
                accumulatedToolCalls.push({
                  type: 'tool-call' as const,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  args: (part as any).input ?? (part as any).args ?? {},
                  result: undefined as any,
                });
                const { parts, cleanText } = getUpdatedParts(assistantText, assistantReasoning, accumulatedToolCalls);
                setMessages((current) =>
                  current.map((item) =>
                    item.id === assistantId
                      ? {
                          ...item,
                          content: cleanText,
                          parts,
                        }
                      : item
                  )
                );
              } else if (part.type === 'reasoning-delta') {
                // Chain of thought / reasoning parts
                assistantReasoning += part.text;
                const { parts, cleanText } = getUpdatedParts(assistantText, assistantReasoning, accumulatedToolCalls);
                setMessages((current) =>
                  current.map((item) =>
                    item.id === assistantId
                      ? {
                          ...item,
                          content: cleanText,
                          parts,
                        }
                      : item
                  )
                );
              }
            }

            // After stream completes, check tool calls
            const validToolCalls = accumulatedToolCalls.filter(tc => tc && tc.toolCallId && tc.toolName);
            console.log('[SkChat] Stream finished. validToolCalls count:', validToolCalls.length, validToolCalls);

            const { parts: finalParts, cleanText: finalCleanText } = getUpdatedParts(assistantText, assistantReasoning, validToolCalls);

            if (validToolCalls.length === 0) {
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        content: finalCleanText,
                        parts: finalParts,
                      }
                    : item
                )
              );
              activeMessages = [
                ...activeMessages,
                {
                  id: assistantId,
                  role: 'assistant',
                  content: finalCleanText,
                  parts: finalParts,
                  createdAt: new Date().toISOString(),
                }
              ];
              runToolCalls = false;
            } else {
              // Tool calls exist — will be handled by existing tool execution logic below
              const toolCallParts = validToolCalls;
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        parts: finalParts,
                      }
                    : item
                )
              );

            // Execute client-side tools
            const currentMessageAttachments: SkChatAttachment[] = [];
            console.log('[SkChat] Starting client-side tool execution loop for parts:', toolCallParts);
            for (const tc of toolCallParts) {
              if (controller.signal.aborted) {
                console.log('[SkChat] Tool execution aborted.');
                break;
              }

              console.log('[SkChat] Executing client-side tool:', tc.toolName, 'args:', tc.args);
              let resultData = '';
              if (tc.toolName === 'computer') {
                const action = tc.args?.action;
                const coordinate = tc.args?.coordinate;
                const text = tc.args?.text;

                if (action === 'screenshot') {
                  const element = contentRef.current;
                  const screenshotUrl = element
                    ? await captureElement(element)
                    : null;
                  if (screenshotUrl) {
                    resultData = screenshotUrl;
                    const attachment: SkChatAttachment = {
                      name: `screenshot-${Date.now()}.jpg`,
                      type: 'image/jpeg',
                      size: 0,
                      data: screenshotUrl,
                    };
                    currentMessageAttachments.push(attachment);
                  } else {
                    resultData = 'No screenshot captured.';
                  }
                } else if (action === 'cursor_position') {
                  resultData = `User cursor position: x=${userMouse.x}, y=${userMouse.y} (scaled to screenshot dimensions). Hovered element: ${userMouse.hoveredElement}`;
                } else if (
                  action === 'mouse_move' ||
                  action === 'left_click' ||
                  action === 'right_click' ||
                  action === 'double_click' ||
                  action === 'type'
                ) {
                  resultData = await moveAndInteract(action, coordinate, text);
                } else {
                  resultData = `Action ${action} is not supported.`;
                }
                // Brief pause for visual tool status
                await new Promise((resolve) => setTimeout(resolve, 500));
              } else if (tc.toolName === 'get_web_content') {
                const element = contentRef.current;
                const html = element?.innerHTML ?? '';
                const title = typeof document !== 'undefined' ? document.title : '';
                const url = typeof window !== 'undefined' ? window.location.href : '';
                const markdown = htmlToMarkdown(html);

                const titlePart = title ? `Title: ${title}\n` : '';
                const urlPart = url ? `URL: ${url}\n` : '';
                const contentDataStr = contentData
                  ? `\n\nContent Data (JSON/Markdown):\n${typeof contentData === 'string' ? contentData : JSON.stringify(contentData, null, 2)}`
                  : '';
                resultData = `${titlePart}${urlPart}\n${markdown || 'No web content captured.'}${contentDataStr}`;
                // Brief pause for visual tool status
                await new Promise((resolve) => setTimeout(resolve, 500));
              } else if (tc.toolName === 'ask_user') {
                const userResponse = await new Promise<string>((resolve) => {
                  askUserResolverRef.current = {
                    toolCallId: tc.toolCallId,
                    resolve,
                  };
                });
                resultData = userResponse;
              } else if (tc.toolName === 'load_skill') {
                const skillName = String(tc.args?.name || activeSkillName || '');
                const skill = skills.find(
                  (item) => item.name.toLowerCase() === skillName.toLowerCase(),
                );
                resultData = skill
                  ? JSON.stringify({
                      name: skill.name,
                      description: skill.description,
                      content: skill.content || skill.description,
                    })
                  : `Skill '${skillName}' not found.`;
              } else if (customTools && customTools[tc.toolName]) {
                try {
                  const toolDef = customTools[tc.toolName];
                  const result = await toolDef.execute(tc.args, {
                    contentRef: contentRef.current,
                    contextSnapshot,
                  });
                  resultData = typeof result === 'string' ? result : JSON.stringify(result);
                } catch (err) {
                  resultData = `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
              } else {
                resultData = 'Unknown tool.';
                // Brief pause for visual tool status
                await new Promise((resolve) => setTimeout(resolve, 500));
              }

              tc.result = resultData;

              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        parts: item.parts?.map((p) =>
                          p.type === 'tool-call' && p.toolCallId === tc.toolCallId
                            ? { ...p, result: resultData }
                            : p
                        ),
                        attachments: currentMessageAttachments.length > 0 ? currentMessageAttachments : item.attachments,
                      }
                    : item
                )
              );
              console.log('[SkChat] Finished executing client-side tool:', tc.toolName, 'resultData length:', resultData.length);
            }

            setTimeout(() => {
              setGuideCoords(null);
            }, 2000);

            const cleanText = stripReasoning(assistantText);
            const { parts: toolFinishedParts } = getUpdatedParts(assistantText, assistantReasoning, toolCallParts);
            activeMessages = [
              ...activeMessages,
              {
                id: assistantId,
                role: 'assistant',
                content: cleanText,
                parts: toolFinishedParts,
                attachments: currentMessageAttachments.length > 0 ? currentMessageAttachments : undefined,
                createdAt: new Date().toISOString(),
              }
            ];
           }
          } else {
            // Proxy mode: send to backend API for processing
            const response = await fetch(apiEndpoint, {
              signal: controller.signal,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              throw new Error(`Chat request failed with ${response.status}`);
            }

            let assistantText = '';
            await readTextStream(response, (chunk) => {
              assistantText += chunk;
              const { parts, cleanText } = getUpdatedParts(assistantText, '', []);
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        content: cleanText,
                        parts,
                      }
                    : item
                )
              );
            });

            const { parts: finalParts, cleanText: finalClean } = getUpdatedParts(assistantText, '', []);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content: finalClean,
                      parts: finalParts,
                    }
                  : item
              )
            );
            activeMessages = [
              ...activeMessages,
              {
                id: assistantId,
                role: 'assistant',
                content: finalClean,
                parts: finalParts,
                createdAt: new Date().toISOString(),
              }
            ];
            runToolCalls = false;
          }
        }
      } catch (cause) {
        console.error('SkChat submit error:', cause);
        if (cause instanceof Error && cause.name === 'AbortError') {
          setMessages((current) =>
            current.map((item) =>
              item.role === 'assistant' && (item.content === '' || (item.parts && item.parts.length === 1 && item.parts[0].type === 'text' && item.parts[0].text === ''))
                ? {
                    ...item,
                    content: 'Generation stopped.',
                    parts: [{ type: 'text', text: 'Generation stopped.' }]
                  }
                : item
            )
          );
          return;
        }
        const nextError = cause instanceof Error ? cause : new Error('Chat request failed');
        setError(nextError);
        setMessages((current) =>
          current.map((item) =>
            item.role === 'assistant' && (item.content === '' || (item.parts && item.parts.length === 1 && item.parts[0].type === 'text' && item.parts[0].text === ''))
              ? {
                  ...item,
                  content: nextError.message,
                  parts: [{ type: 'text', text: nextError.message }]
                }
              : item
          )
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [
      apiKey,
      apiEndpoint,
      apiMode,
      attachments,
      clearAttachments,
      conversationId,
      messages,
      metadata,
      model,
      provider,
      refreshContext,
      selectedSkillName,
      skills,
      systemPrompt,
      contentData,
    ],
  );

  const editMessage = useCallback(
    async (messageId: string, text: string, metadata?: Record<string, any>) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      stopMessage();
      const truncated = messages.slice(0, idx);
      setMessages(truncated);

      await sendMessage(text, [], { metadata });
    },
    [messages, stopMessage, sendMessage],
  );

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessage || isLoading) return;
    await sendMessage(lastUserMessage, []);
  }, [isLoading, lastUserMessage, sendMessage]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    const nextAttachments = await Promise.all(nextFiles.map(fileToAttachment));
    setAttachments((current) => [...current, ...nextAttachments]);
    return nextAttachments;
  }, []);

  const removeAttachment = useCallback((name: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.name !== name));
  }, []);

  const createThread = useCallback(() => {
    const threadId = createId('thread');
    const newThread: SkChatThread = {
      id: threadId,
      title: 'Cuộc trò chuyện mới',
      createdAt: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : 'New Page',
    };
    setThreads((current) => [newThread, ...current]);
    setActiveThreadId(threadId);
    setMessages([]);
    setError(null);
    setLastUserMessage(null);
    clearAttachments();
    if (askUserResolverRef.current) {
      askUserResolverRef.current.resolve('Conversation switched.');
      askUserResolverRef.current = null;
    }
  }, [clearAttachments]);

  const deleteThread = useCallback((id: string) => {
    setThreads((current) => {
      const updated = current.filter((t) => t.id !== id);
      
      // If we deleted the active thread, switch to another thread
      if (activeThreadId === id) {
        if (updated.length > 0) {
          setActiveThreadId(updated[0].id);
        } else {
          const defaultId = createId('thread');
          const defaultThread: SkChatThread = {
            id: defaultId,
            title: 'Cuộc trò chuyện mới',
            createdAt: new Date().toISOString(),
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            pageTitle: typeof document !== 'undefined' ? document.title : undefined,
          };
          setActiveThreadId(defaultId);
          return [defaultThread];
        }
      }
      return updated;
    });

    if (normalizedMemory.type === 'local' && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(`sk-chat:thread:messages:${id}`);
      } catch {
        // Ignore
      }
    }
  }, [activeThreadId, normalizedMemory.type]);

  const clearConversation = useCallback(() => {
    stopMessage();
    setMessages([]);
    setError(null);
    setLastUserMessage(null);
    clearAttachments();
    if (askUserResolverRef.current) {
      askUserResolverRef.current.resolve('Conversation cleared.');
      askUserResolverRef.current = null;
    }
  }, [clearAttachments, stopMessage]);

  const value: SkChatValue = useMemo(
    () => ({
      isOpen,
      isLoading,
      error,
      markdown: contextSnapshot.markdown,
      screenshot: contextSnapshot.screenshot,
      html: contextSnapshot.html,
      requestPreview: contextSnapshot.requestPreview,
      contextDebug: contextSnapshot.debug,
      messages,
      conversationId,
      attachments,
      skills,
      selectedSkillName,
      setSelectedSkillName,
      refreshContext,
      openChat: () => setIsOpen(true),
      closeChat: () => setIsOpen(false),
      toggleChat: () => setIsOpen((current) => !current),
      sendMessage,
      editMessage,
      retryLastMessage,
      clearConversation,
      addFiles,
      removeAttachment,
      stopMessage,
      submitUserResponse,
      metadata,
      shareContext,
      setShareContext,
      customTools,
      threads,
      activeThreadId,
      setActiveThreadId,
      createThread,
      deleteThread,
      isHistoryOpen,
      setIsHistoryOpen,
    }),
    [
      addFiles,
      attachments,
      clearConversation,
      contextSnapshot.html,
      contextSnapshot.debug,
      contextSnapshot.markdown,
      contextSnapshot.requestPreview,
      contextSnapshot.screenshot,
      conversationId,
      error,
      isLoading,
      isOpen,
      messages,
      refreshContext,
      removeAttachment,
      retryLastMessage,
      selectedSkillName,
      sendMessage,
      editMessage,
      skills,
      stopMessage,
      submitUserResponse,
      metadata,
      shareContext,
      customTools,
      threads,
      activeThreadId,
      createThread,
      deleteThread,
      isHistoryOpen,
    ],
  );

  const style = {
    '--sk-chat-primary': theme?.primaryColor,
    '--sk-chat-radius': theme?.borderRadius,
    '--sk-chat-sidebar-width': theme?.sidebarWidth,
    '--sk-chat-z-index': theme?.zIndex,
    ...customStyle,
  } as CSSProperties;

  const speechText = useMemo(() => {
    if (guideCoords) {
      return guideCoords.text;
    }
    return getAgentSpeechText(messages, isLoading);
  }, [messages, isLoading, guideCoords]);

  const showSpeechBubble = speechText.trim().length > 0;

  const petPositionStyle: CSSProperties = useMemo(() => {
    if (!canPortalControls) {
      // Return static styles for initial SSR render to avoid hydration mismatch
      return {
        position: 'fixed',
        bottom: '24px',
        left: isOpen
          ? 'auto'
          : (position === 'bottom-left' ? '24px' : 'auto'),
        right: isOpen
          ? 'calc(var(--sk-chat-sidebar-width, 420px) + 24px)'
          : (position === 'bottom-right' ? '24px' : 'auto'),
        top: 'auto',
      };
    }

    const transition = 'all 800ms ease-in-out';

    if (guideCoords) {
      const petWidth = 96;
      const petHeight = 104;

      // Horizontal position: right if target on left half, left if target on right half
      let left = guideCoords.x < window.innerWidth / 2
        ? guideCoords.x + 30
        : guideCoords.x - petWidth - 30;

      // Vertical position: centered relative to target point, clamped to viewport
      let top = guideCoords.y - petHeight / 2;
      top = Math.min(Math.max(10, top), window.innerHeight - petHeight - 10);
      left = Math.min(Math.max(10, left), window.innerWidth - petWidth - 10);

      return {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        bottom: 'auto',
        right: 'auto',
        transition,
      };
    }

    if (coordsRef.current) {
      return {
        position: 'fixed',
        left: `${coordsRef.current.x}px`,
        top: `${coordsRef.current.y}px`,
        bottom: 'auto',
        right: 'auto',
        transition,
      };
    }

    // Home position after mount
    const home = getHomeCoords();
    return {
      position: 'fixed',
      left: `${home.x}px`,
      top: `${home.y}px`,
      bottom: 'auto',
      right: 'auto',
      transition,
    };
  }, [canPortalControls, isOpen, position, guideCoords, getHomeCoords]);

  const controls = (
    <div className="fixed inset-0 pointer-events-none z-[2147483600]" style={style}>
      <div
        className={cn(
          "fixed z-[2147483600] flex items-center justify-center pointer-events-auto cursor-grab hover:scale-105 active:scale-95 transition-all duration-200",
          buttonClassName
        )}
        style={petPositionStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={handleMouseEnterPet}
        onClick={(e) => {
          if (isDraggingRef.current) {
            e.preventDefault();
            e.stopPropagation();
            isDraggingRef.current = false;
            return;
          }

          if (isOpen) {
            setIsOpen(false);
          } else {
            void refreshContext().catch((cause) => {
              console.warn('sk-chat: cannot refresh context before opening', cause);
            });
            setIsOpen(true);
          }
        }}
        title={isOpen ? "Đóng cuộc trò chuyện" : "Trò chuyện with AI"}
      >
        {showSpeechBubble && (
          <div
            className="absolute bottom-[105%] mb-3 backdrop-blur-sm rounded-2xl border shadow-2xl min-w-[160px] max-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer pointer-events-auto select-none"
            style={{
              backgroundColor: '#0f172a',
              color: '#ffffff',
              borderColor: '#1e293b',
              padding: '10px 14px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              void refreshContext().catch((cause) => {
                console.warn('sk-chat: cannot refresh context before opening', cause);
              });
              setIsOpen(true);
            }}
          >
            <div className={cn("leading-relaxed font-medium text-xs", !guideCoords && "line-clamp-3")}>
              {speechText}
            </div>
            {/* Arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent"
              style={{ borderTopColor: '#0f172a' }}
            />
          </div>
        )}
        <CodexPet ref={petRef} id="assistant" aria-label="Virtual Pet" />
      </div>
    </div>
  );

  const targetIndicator = guideCoords && (
    <div
      className="fixed pointer-events-none z-[2147483645] -translate-x-1/2 -translate-y-1/2"
      style={{ left: guideCoords.x, top: guideCoords.y }}
    >
      <span className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 inline-flex h-8 w-8 rounded-full opacity-75 animate-ping transition-colors duration-300",
        (guideCoords.success || guideCoords.isClicking) ? "bg-green-400" : "bg-blue-400"
      )} />
      <span className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 inline-flex rounded-full h-3 w-3 shadow-md border border-white transition-colors duration-300",
        (guideCoords.success || guideCoords.isClicking) ? "bg-green-500" : "bg-blue-500"
      )} />
    </div>
  );

  return (
    <CodexPetProvider
      pets={{
        assistant: {
          draggable: false,
          floating: false,
          fps: 8,
          scale: 0.5,
          spritesheetUrl: "https://froemic.github.io/codex-pets-web/pets/bandit/spritesheet.webp",
          stateFps: { idle: 3 }
        }
      }}
    >
      <SkChatContext.Provider value={value}>
        <div className={cn('flex w-full h-full relative overflow-hidden', className)} style={style}>
          <div ref={contentRef} className={cn('flex-1 h-full min-w-0 transition-all duration-300', contentClassName)}>
            {children}
          </div>
          <SkChatSidebar
            title={title}
            placeholder={placeholder}
            className={sidebarClassName}
            enableFileUpload={enableFileUpload}
            debug={debug}
          />
          {canPortalControls ? createPortal(controls, document.body) : controls}
          {targetIndicator && (canPortalControls ? createPortal(targetIndicator, document.body) : targetIndicator)}
        </div>
      </SkChatContext.Provider>
    </CodexPetProvider>
  );
}
