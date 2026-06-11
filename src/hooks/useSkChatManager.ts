import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import type { CodexPetState } from 'codex-pet-web';
import type { CodexPetHandle } from 'codex-pet-web-react';

import type {
  SkChatMessage,
  SkChatContextSnapshot,
  SkChatAttachment,
  SkChatThread,
  SkChatValue,
  SkChatProviderProps,
} from '../types';
import {
  DEFAULT_ENDPOINT,
  normalizeMemory,
  createId,
  isOpenAiCompatibleEndpoint,
  normalizeChatCompletionEndpoint,
  getScreenshotByteSize,
  getScreenshotMimeType,
  stripReasoning,
  getUpdatedParts,
  supportsVision,
  formatUserContentWithScreenshot,
  readTextStream,
  getAgentPetState,
  getAgentSpeechText,
} from '../utils/providerHelpers';

import { captureElement } from '../utils/captureElement';
import { fileToAttachment } from '../utils/fileToAttachment';
import { htmlToMarkdown } from '../utils/htmlToMarkdown';
import { DEFAULT_SYSTEM_PROMPT } from '../prompts';
import { buildSkillsPrompt, DEFAULT_SK_CHAT_SKILLS } from '../skills';

export function useSkChatManager({
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
  theme,
  debug = false,
  contentData,
  style: customStyle,
  customTools,
}: SkChatProviderProps) {
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

  const stopMessage = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (askUserResolverRef.current) {
      askUserResolverRef.current.resolve('User cancelled or stopped the message.');
      askUserResolverRef.current = null;
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

  const currentPetStateRef = useRef<string>('idle');
  const setPetState = useCallback((state: string) => {
    if (currentPetStateRef.current === state) return;
    currentPetStateRef.current = state;
    petRef.current?.setState(state as any);
  }, []);

  // Sync coords reset during render when isOpen changes
  const prevIsOpenRef = useRef(isOpen);
  if (prevIsOpenRef.current !== isOpen) {
    coordsRef.current = null;
    prevIsOpenRef.current = isOpen;
  }

  // Track previous isLoading to detect transitions
  const prevIsLoadingRef = useRef(isLoading);

  useEffect(() => {
    if (isDraggingActiveRef.current) return;

    if (error) {
      setPetState('failed');
      prevIsLoadingRef.current = isLoading;
      return;
    }

    if (isLoading && !prevIsLoadingRef.current) {
      const targetState = getAgentPetState(messages, true, null);
      petRef.current?.play('jumping', { loops: 1, returnTo: targetState });
    } else if (!isLoading && prevIsLoadingRef.current) {
      petRef.current?.play('waving', { loops: 1, returnTo: 'idle' });
    } else {
      const targetState = getAgentPetState(messages, isLoading, error);
      setPetState(targetState);
    }

    prevIsLoadingRef.current = isLoading;
  }, [isLoading, error, messages, setPetState]);

  const getHomeCoords = useCallback(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };

    const petWidth = 96;
    const petHeight = 104;

    let left = 0;
    let top = window.innerHeight - petHeight - 24;
    const sidebarWidth = 420;

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



  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

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

    setPetState('idle');

    e.currentTarget.classList.remove('cursor-grab');
    e.currentTarget.classList.add('cursor-grabbing');

    e.currentTarget.setPointerCapture(e.pointerId);
  }, [setPetState]);

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

      e.currentTarget.style.left = `${x}px`;
      e.currentTarget.style.top = `${y}px`;
      e.currentTarget.style.bottom = 'auto';
      e.currentTarget.style.right = 'auto';
      e.currentTarget.style.transition = 'none';

      const pointerDeltaX = e.clientX - lastXRef.current;
      if (pointerDeltaX > 2) {
        setPetState('running-right');
      } else if (pointerDeltaX < -2) {
        setPetState('running-left');
      }

      lastXRef.current = e.clientX;
    }
  }, [setPetState]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStartRef.current = null;
      isDraggingActiveRef.current = false;

      e.currentTarget.classList.remove('cursor-grabbing');
      e.currentTarget.classList.add('cursor-grab');

      const targetState = getAgentPetState(messages, isLoading, error);
      setPetState(targetState);
    },
    [messages, isLoading, error, setPetState],
  );

  const normalizedMemory = useMemo(
    () => normalizeMemory(memory, enableMemory),
    [enableMemory, memory],
  );

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
    if (normalizedMemory.type !== 'local' || typeof window === 'undefined' || !activeThreadId)
      return;
    try {
      window.localStorage.setItem(
        `sk-chat:thread:messages:${activeThreadId}`,
        JSON.stringify(messages),
      );
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
        }),
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
          }),
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

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const isDirectChatCompletion = isOpenAiCompatibleEndpoint(apiEndpoint, apiMode);
      const context = isDirectChatCompletion || !shareContext ? {} : await refreshContext();
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

      const activeMessages = [...messages, userMessage];

      clearAttachments();

      if (activeThreadId) {
        setThreads((current) =>
          current.map((t) => {
            if (t.id === activeThreadId && t.title === 'Cuộc trò chuyện mới') {
              const snippet = message.trim().slice(0, 30) + (message.length > 30 ? '...' : '');
              return { ...t, title: snippet || 'Cuộc trò chuyện mới' };
            }
            return t;
          }),
        );
      }

      try {
        const assistantId = createId('assistant');
        setMessages([
          ...activeMessages,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            parts: [{ type: 'text', text: '' }],
            createdAt: new Date().toISOString(),
          },
        ]);

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

        let latestScreenshotUrl: string | null = null;
        for (let i = activeMessages.length - 1; i >= 0; i--) {
          const msg = activeMessages[i];
          if (msg.parts && msg.parts.length > 0) {
            const toolCalls = msg.parts.filter((p) => p.type === 'tool-call');
            const screenshotCall = toolCalls.find(
              (tc) =>
                tc.toolName === 'screenshot' &&
                tc.result &&
                tc.result.startsWith('data:image/'),
            );
            if (screenshotCall) {
              latestScreenshotUrl = screenshotCall.result;
              break;
            }
          }
        }

        let lastUserMessageIdx = -1;
        for (let i = activeMessages.length - 1; i >= 0; i--) {
          if (activeMessages[i].role === 'user') {
            lastUserMessageIdx = i;
            break;
          }
        }

        const quoteText = options?.metadata?.custom?.quote?.text;
        const quotePrefix = quoteText ? `[Referring to: "${quoteText}"]\n\n` : '';

        const compiledSystemPrompt = [
          systemPrompt || DEFAULT_SYSTEM_PROMPT,
          `Thông tin ngữ cảnh người dùng:
- Tên người dùng: ${metadata?.userName || 'Người dùng'}
- Hành động hiện tại của người dùng: ${metadata?.userAction || metadata?.currentAction || metadata?.activity || metadata?.action || 'Đang xem trang bài học'}`,
        ]
          .filter(Boolean)
          .join('\n\n');

        const body: any = {
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
                content:
                  item.role === 'user' ? itemQuotePrefix + item.content : item.content,
              };
            }),
          provider,
          model,
          systemPrompt: compiledSystemPrompt,
        };

        if (isDirectChatCompletion) {
          const openai = createOpenAI({
            baseURL: apiEndpoint.replace(/\/$/, ''),
            apiKey: apiKey || '',
          });

          // Build AI SDK formatted messages
          const sdkMessages: any[] = [];
          for (let i = 0; i < activeMessages.length; i++) {
            const msg = activeMessages[i];
            if (msg.role === 'system') continue;

            if (msg.parts && msg.parts.length > 0) {
              const toolCalls = msg.parts.filter((p: any) => p.type === 'tool-call');
              const textPart = msg.parts.find((p: any) => p.type === 'text');

              if (toolCalls.length > 0) {
                const tp = textPart as any;
                sdkMessages.push({
                  role: 'assistant' as const,
                  content: [
                    ...(tp?.text ? [{ type: 'text' as const, text: String(tp.text) }] : []),
                    ...toolCalls.map((tc: any) => ({
                      type: 'tool-call' as const,
                      toolCallId: tc.toolCallId,
                      toolName: tc.toolName,
                      args: tc.args || {},
                    })),
                  ],
                });
                for (const rawTc of toolCalls) {
                  const tc = rawTc as any;
                  if (tc.result !== undefined) {
                    let outputValue =
                      typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result);
                    if (tc.toolName === 'screenshot') {
                      outputValue = 'Screenshot captured successfully.';
                    }
                    sdkMessages.push({
                      role: 'tool' as const,
                      content: [
                        {
                          type: 'tool-result' as const,
                          toolCallId: tc.toolCallId,
                          toolName: tc.toolName,
                          result: outputValue,
                        },
                      ],
                    });
                  }
                }
                continue;
              }
            }

            if (msg.role === 'user') {
              const isLastUser = i === lastUserMessageIdx;
              const content = formatUserContentWithScreenshot(
                msg,
                isLastUser ? latestScreenshotUrl : null,
                supportsVision(model),
              );
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

          const streamResult = streamText({
            model: openai.chat(model || 'gpt-4o-mini'),
            abortSignal: controller.signal,
            maxOutputTokens: 4096,
            maxSteps: 8, // Enable auto-tool execution loop natively!
            system: [
              compiledSystemPrompt,
              buildSkillsPrompt(skills),
              activeSkillName
                ? `Selected skill: ${activeSkillName}. Load this skill before answering.`
                : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
            messages: sdkMessages,
            onError: (err: any) => {
              console.error('[SkChat] streamText onError callback:', err);
              const nextError = err instanceof Error ? err : new Error(String(err));
              setError(nextError);
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        content: nextError.message,
                        parts: [{ type: 'text', text: nextError.message }],
                      }
                    : item,
                ),
              );
            },
            tools: {
              screenshot: {
                description: 'Take a screenshot of the current website content region to capture visual state.',
                parameters: z.object({}),
                execute: async () => {
                  const element = contentRef.current;
                  const screenshotUrl = element ? await captureElement(element) : null;
                  if (screenshotUrl) {
                    const attachment: SkChatAttachment = {
                      name: `screenshot-${Date.now()}.jpg`,
                      type: 'image/jpeg',
                      size: 0,
                      data: screenshotUrl,
                    };
                    setMessages((current) =>
                      current.map((item) =>
                        item.id === assistantId
                          ? {
                              ...item,
                              attachments: [...(item.attachments || []), attachment],
                            }
                          : item,
                      ),
                    );
                    return screenshotUrl;
                  }
                  return 'No screenshot captured.';
                },
              } as any,
              get_web_content: {
                description: 'Read the full text/markdown content of the current web page.',
                parameters: z.object({}),
                execute: async () => {
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
                  return `${titlePart}${urlPart}\n${markdown || 'No web content captured.'}${contentDataStr}`;
                },
              } as any,

              load_skill: {
                description: 'Load specialized instructions for a learning skill by name.',
                parameters: z.object({
                  name: z.string(),
                }),
                execute: async ({ name }: { name: string }) => {
                  const skillName = String(name || activeSkillName || '');
                  const skill = skills.find(
                    (item) => item.name.toLowerCase() === skillName.toLowerCase(),
                  );
                  return skill
                    ? JSON.stringify({
                        name: skill.name,
                        description: skill.description,
                        content: skill.content || skill.description,
                      })
                    : `Skill '${skillName}' not found.`;
                },
              } as any,
              ...(() => {
                const custom: Record<string, any> = {};
                if (customTools) {
                  for (const [name, toolDef] of Object.entries(customTools)) {
                    custom[name] = {
                      description: toolDef.description,
                      parameters:
                        toolDef.parameters instanceof z.ZodType ? toolDef.parameters : z.any(),
                      execute: async (args: unknown) => {
                        try {
                          const result = await toolDef.execute(args, {
                            contentRef: contentRef.current,
                            contextSnapshot,
                          });
                          return typeof result === 'string' ? result : JSON.stringify(result);
                        } catch (err) {
                          return `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
                        }
                      },
                    } as any;
                  }
                }
                return custom;
              })(),
            } as any,
          } as any);

          const accumulatedParts: any[] = [];
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
            } else if (part.type === 'reasoning-delta') {
              assistantReasoning += part.text;
            } else if (part.type === 'tool-call') {
              console.log('[SkChat] Stream received tool-call delta:', part);
              accumulatedParts.push({
                type: 'tool-call' as const,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: (part as any).args || {},
                result: undefined,
              });
            } else if (part.type === 'tool-result') {
              console.log('[SkChat] Stream tool-result resolved:', part);
              const tcIdx = accumulatedParts.findIndex((p) => p.toolCallId === part.toolCallId);
              if (tcIdx !== -1) {
                accumulatedParts[tcIdx].result = (part as any).result;
              }
            }

            const { parts, cleanText } = getUpdatedParts(
              assistantText,
              assistantReasoning,
              accumulatedParts,
            );
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content: cleanText,
                      parts,
                    }
                  : item,
              ),
            );
          }
        } else {
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
                  : item,
              ),
            );
          });

          const { parts: finalParts, cleanText: finalClean } = getUpdatedParts(
            assistantText,
            '',
            [],
          );
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: finalClean,
                    parts: finalParts,
                  }
                : item,
            ),
          );
        }
      } catch (cause) {
        console.error('SkChat submit error:', cause);
        if (cause instanceof Error && cause.name === 'AbortError') {
          setMessages((current) =>
            current.map((item) =>
              item.role === 'assistant' &&
              (item.content === '' ||
                (item.parts &&
                  item.parts.length === 1 &&
                  item.parts[0].type === 'text' &&
                  item.parts[0].text === ''))
                ? {
                    ...item,
                    content: 'Generation stopped.',
                    parts: [{ type: 'text', text: 'Generation stopped.' }],
                  }
                : item,
            ),
          );
          return;
        }
        const nextError = cause instanceof Error ? cause : new Error('Chat request failed');
        setError(nextError);
        setMessages((current) =>
          current.map((item) =>
            item.role === 'assistant' &&
            (item.content === '' ||
              (item.parts &&
                item.parts.length === 1 &&
                item.parts[0].type === 'text' &&
                item.parts[0].text === ''))
              ? {
                  ...item,
                  content: nextError.message,
                  parts: [{ type: 'text', text: nextError.message }],
                }
              : item,
          ),
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [
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
      customTools,
      contextSnapshot,
      apiKey,
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

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((current) => {
        const updated = current.filter((t) => t.id !== id);

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
    },
    [activeThreadId, normalizedMemory.type],
  );

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
    return getAgentSpeechText(messages, isLoading);
  }, [messages, isLoading]);

  const showSpeechBubble = speechText.trim().length > 0;

  const petPositionStyle: CSSProperties = useMemo(() => {
    if (!canPortalControls) {
      return {
        position: 'fixed',
        bottom: '24px',
        left: isOpen ? 'auto' : position === 'bottom-left' ? '24px' : 'auto',
        right: isOpen
          ? 'calc(var(--sk-chat-sidebar-width, 420px) + 24px)'
          : position === 'bottom-right' ? '24px' : 'auto',
        top: 'auto',
      };
    }

    const transition = 'all 800ms ease-in-out';

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

    const home = getHomeCoords();
    return {
      position: 'fixed',
      left: `${home.x}px`,
      top: `${home.y}px`,
      bottom: 'auto',
      right: 'auto',
      transition,
    };
  }, [canPortalControls, isOpen, position, getHomeCoords]);

  return {
    contentRef,
    petRef,
    coordsRef,
    isDraggingRef,
    isOpen,
    setIsOpen,
    canPortalControls,
    value,
    style,
    speechText,
    showSpeechBubble,
    petPositionStyle,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
