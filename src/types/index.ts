import type { CSSProperties, ReactNode } from 'react';

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'openrouter'
  | 'custom'
  | string;

export type SkChatPosition = 'bottom-right' | 'bottom-left';

export type SkChatMemory =
  | {
      type: 'local' | 'remote' | 'none';
      conversationId?: string;
    }
  | 'local'
  | 'remote'
  | 'none';

export type SkChatTheme = {
  primaryColor?: string;
  borderRadius?: string;
  sidebarWidth?: string;
  zIndex?: number;
};

export type SkChatAttachment = {
  name: string;
  type: string;
  size: number;
  data?: string;
  url?: string;
};

export type SkChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: SkChatAttachment[];
  createdAt?: string;
  metadata?: Record<string, any>;
  parts?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; args: any; result?: any }
    | { type: 'reasoning'; text: string }
  >;
};

export type SkChatSkill = {
  name: string;
  description: string;
  label?: string;
  content?: string;
};

export type SkChatContextSnapshot = {
  markdown?: string;
  html?: string;
  screenshot?: string;
  url?: string;
  title?: string;
  contentData?: any;
  requestPreview?: {
    endpoint?: string;
    mode?: 'proxy' | 'openai-compatible';
    model?: string;
    hasScreenshot: boolean;
    screenshotTransport?: 'base64-data-url' | 'none';
    screenshotMimeType?: string;
    screenshotBytes: number;
    markdownLength: number;
    htmlLength: number;
    metadata?: Record<string, unknown>;
  };
  debug?: {
    capturedAt: string;
    elementFound: boolean;
    htmlLength: number;
    markdownLength: number;
    screenshotLength: number;
    screenshotError?: string;
    elementRect?: {
      width: number;
      height: number;
      scrollWidth: number;
      scrollHeight: number;
    };
  };
};

export type SkChatThread = {
  id: string;
  title: string;
  createdAt: string;
  url?: string;
  pageTitle?: string;
};


export type SkChatRequest = {
  message: string;
  conversationId?: string;
  context: SkChatContextSnapshot;
  attachments?: SkChatAttachment[];
  skills?: SkChatSkill[];
  selectedSkillName?: string;
  metadata?: Record<string, unknown>;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  provider?: ModelProvider;
  model?: string;
  systemPrompt?: string;
};

export type SkChatCustomTool = {
  description: string;
  parameters: any;
  execute: (
    args: any,
    context: {
      contentRef: HTMLDivElement | null;
      contextSnapshot: SkChatContextSnapshot;
    },
  ) => Promise<any> | any;
};

export type SkChatProviderProps = {
  children: ReactNode;
  apiEndpoint?: string;
  apiKey?: string;
  apiMode?: 'proxy' | 'openai-compatible';
  provider?: ModelProvider;
  model?: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  enableScreenshot?: boolean;
  enableMarkdownContext?: boolean;
  enableFileUpload?: boolean;
  enableMemory?: boolean;
  skills?: SkChatSkill[];
  memory?: SkChatMemory;
  position?: SkChatPosition;
  className?: string;
  contentClassName?: string;
  sidebarClassName?: string;
  buttonClassName?: string;
  title?: string;
  placeholder?: string;
  theme?: SkChatTheme;
  debug?: boolean;
  contentData?: any;
  style?: CSSProperties;
  customTools?: Record<string, SkChatCustomTool>;
};

export type SkChatValue = {
  isOpen: boolean;
  isLoading: boolean;
  error: Error | null;
  markdown?: string;
  screenshot?: string;
  html?: string;
  requestPreview?: SkChatContextSnapshot['requestPreview'];
  contextDebug?: SkChatContextSnapshot['debug'];
  messages: SkChatMessage[];
  conversationId?: string;
  attachments: SkChatAttachment[];
  skills: SkChatSkill[];
  selectedSkillName?: string;
  setSelectedSkillName: (skillName?: string) => void;
  refreshContext: () => Promise<SkChatContextSnapshot>;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  sendMessage: (
    message: string,
    attachments?: SkChatAttachment[],
    options?: { selectedSkillName?: string; metadata?: Record<string, any> },
  ) => Promise<void>;
  editMessage: (
    messageId: string,
    text: string,
    metadata?: Record<string, any>,
  ) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearConversation: () => void;
  addFiles: (files: FileList | File[]) => Promise<SkChatAttachment[]>;
  removeAttachment: (name: string) => void;
  stopMessage: () => void;
  submitUserResponse: (toolCallId: string, response: string) => void;
  metadata?: Record<string, unknown>;
  shareContext: boolean;
  setShareContext: (val: boolean) => void;
  customTools?: Record<string, SkChatCustomTool>;
  threads: SkChatThread[];
  activeThreadId?: string;
  setActiveThreadId: (id: string) => void;
  createThread: () => void;
  deleteThread: (id: string) => void;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
};

