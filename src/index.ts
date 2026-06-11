import './index.css';

export { SkChatProvider } from './components/SkChatProvider';
export { SkChatSidebar, ChatSidebar } from './components/ChatSidebar';
export { useSkChat } from './hooks/useSkChat';
export { StreamdownText } from './components/ui/streamdown-text';
export { UserActionBar, AssistantActionBar } from './components/ui/message-actions';
export { UserMessage } from './components/ui/user-message';
export { AssistantMessage } from './components/ui/assistant-message';
export { UserEditComposer } from './components/ui/edit-composer';
export { ChainOfThought } from './components/ui/chain-of-thought';
export {
  createSkChatAgent,
  createSkChatTools,
  skChatRequestToModelMessages,
  streamSkChatResponse,
} from './agent';
export { DEFAULT_SYSTEM_PROMPT } from './prompts';
export {
  buildSkillsPrompt,
  DEFAULT_SK_CHAT_SKILLS,
  stripSkillFrontmatter,
} from './skills';
export { htmlToMarkdown } from './utils/htmlToMarkdown';
export { captureElement } from './utils/captureElement';
export { fileToAttachment } from './utils/fileToAttachment';
export type {
  CreateSkChatAgentOptions,
  SkChatAgentCallOptions,
  SkChatAgentContext,
  SkChatTools,
} from './agent';
export type {
  ModelProvider,
  SkChatAttachment,
  SkChatContextSnapshot,
  SkChatMemory,
  SkChatMessage,
  SkChatPosition,
  SkChatProviderProps,
  SkChatRequest,
  SkChatSkill,
  SkChatTheme,
  SkChatValue,
  SkChatThread,
} from './types';
