import {
  ToolLoopAgent,
  jsonSchema,
  stepCountIs,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolLoopAgentSettings,
} from 'ai';
import { DEFAULT_SYSTEM_PROMPT } from './prompts';
import { buildSkillsPrompt, DEFAULT_SK_CHAT_SKILLS, stripSkillFrontmatter } from './skills';
import type {
  SkChatAttachment,
  SkChatContextSnapshot,
  SkChatRequest,
  SkChatSkill,
} from './types';

type EmptyInput = Record<string, never>;

type AskUserInput = {
  question: string;
  options: string[];
};

type LoadSkillInput = {
  name: string;
};

export type SkChatAgentCallOptions = {
  request: SkChatRequest;
};

export type SkChatAgentContext = {
  request: SkChatRequest;
};

function getAgentContext(context: unknown): SkChatAgentContext {
  if (
    context &&
    typeof context === 'object' &&
    'request' in context
  ) {
    return context as SkChatAgentContext;
  }

  return {
    request: {
      message: '',
      context: {},
    },
  };
}

function createTextWithMetadata(request: SkChatRequest) {
  const metadata = request.metadata && Object.keys(request.metadata).length > 0
    ? `\n\nMetadata:\n${JSON.stringify(request.metadata, null, 2)}`
    : '';

  return [
    request.message,
    request.selectedSkillName ? `\n\nSelected skill: ${request.selectedSkillName}` : '',
    metadata,
  ].join('');
}

function getImagePart(attachment: SkChatAttachment) {
  if (!attachment.type.startsWith('image/') || !attachment.data) return undefined;

  return {
    type: 'image' as const,
    image: attachment.data,
    mediaType: attachment.type,
  };
}

export function skChatRequestToModelMessages(request: SkChatRequest): ModelMessage[] {
  const messages: ModelMessage[] = (request.history || [])
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role,
      content: item.content,
    })) as ModelMessage[];

  const imageParts = (request.attachments || [])
    .map(getImagePart)
    .filter((part): part is NonNullable<ReturnType<typeof getImagePart>> => Boolean(part));

  messages.push({
    role: 'user',
    content: imageParts.length > 0
      ? [
          { type: 'text', text: createTextWithMetadata(request) },
          ...imageParts,
        ]
      : createTextWithMetadata(request),
  });

  return messages;
}

export function createSkChatTools() {
  return {
    load_skill: tool<LoadSkillInput, { name: string; description: string; content: string } | { error: string }>({
      description: 'Load a skill to get specialized instructions for the selected learning workflow.',
      inputSchema: jsonSchema<LoadSkillInput>({
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The skill name to load.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      }),
      execute: async ({ name }, options) => {
        const { request } = getAgentContext(options.experimental_context);
        const skills = request.skills || [];
        const skill = skills.find(
          (item) => item.name.toLowerCase() === name.toLowerCase(),
        );

        if (!skill) {
          return { error: `Skill '${name}' not found` };
        }

        return {
          name: skill.name,
          description: skill.description,
          content: stripSkillFrontmatter(skill.content || skill.description),
        };
      },
    }),
    get_web_content: tool<EmptyInput, string>({
      description:
        'Read the markdown text, title, and URL captured from the current website content region.',
      inputSchema: jsonSchema<EmptyInput>({
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      execute: async (_input, options) => {
        const { request } = getAgentContext(options.experimental_context);
        const titlePart = request.context.title ? `Title: ${request.context.title}\n` : '';
        const urlPart = request.context.url ? `URL: ${request.context.url}\n` : '';
        const markdownPart = request.context.markdown || request.context.html || 'No web content captured.';
        const contentDataPart = request.context.contentData
          ? `\n\nContent Data (JSON/Markdown):\n${typeof request.context.contentData === 'string' ? request.context.contentData : JSON.stringify(request.context.contentData, null, 2)}`
          : '';
        return `${titlePart}${urlPart}\n${markdownPart}${contentDataPart}`;
      },
    }),
    computer: tool<{
      action: 'screenshot' | 'mouse_move' | 'left_click' | 'right_click' | 'double_click' | 'left_mouse_down' | 'left_mouse_up' | 'type' | 'key' | 'cursor_position';
      coordinate?: [number, number];
      text?: string;
    }, string>({
      description: 'Interact with the screen by taking screenshots, clicking coordinates, typing text, or guiding the user.',
      inputSchema: jsonSchema<{
        action: 'screenshot' | 'mouse_move' | 'left_click' | 'right_click' | 'double_click' | 'left_mouse_down' | 'left_mouse_up' | 'type' | 'key' | 'cursor_position';
        coordinate?: [number, number];
        text?: string;
      }>({
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['screenshot', 'mouse_move', 'left_click', 'right_click', 'double_click', 'left_mouse_down', 'left_mouse_up', 'type', 'key', 'cursor_position'],
            description: 'The action to perform.',
          },
          coordinate: {
            type: 'array',
            items: { type: 'number' },
            description: 'The [x, y] coordinates relative to the captured screenshot (0 to width/height of the image).',
          },
          text: {
            type: 'string',
            description: 'The text to type or the instruction/key combination.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      }),
      execute: async ({ action, coordinate, text }, options) => {
        const { request } = getAgentContext(options.experimental_context);
        if (action === 'screenshot') {
          return request.context.screenshot || 'No screenshot captured.';
        }
        return `Action ${action} executed at ${coordinate ? `[${coordinate.join(', ')}]` : 'N/A'}.`;
      },
    }),
    ask_user: tool<AskUserInput, string>({
      description:
        'Prepare a concise clarifying question with options when more information is needed from the student.',
      inputSchema: jsonSchema<AskUserInput>({
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The clarifying question to ask the student.',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Suggested response options.',
          },
        },
        required: ['question', 'options'],
        additionalProperties: false,
      }),
      execute: async ({ question, options }) =>
        [
          'Ask the student this clarification in your final response.',
          `Question: ${question}`,
          options.length > 0 ? `Options: ${options.join(' | ')}` : undefined,
        ].filter(Boolean).join('\n'),
    }),
  };
}

export type SkChatTools = ReturnType<typeof createSkChatTools>;

export type CreateSkChatAgentOptions = Omit<
  ToolLoopAgentSettings<SkChatAgentCallOptions, SkChatTools>,
  | 'model'
  | 'tools'
  | 'instructions'
  | 'prepareCall'
  | 'callOptionsSchema'
  | 'experimental_context'
> & {
  model: LanguageModel;
  instructions?: string;
  skills?: SkChatSkill[];
  maxSteps?: number;
};

export function createSkChatAgent({
  instructions = DEFAULT_SYSTEM_PROMPT,
  skills = DEFAULT_SK_CHAT_SKILLS,
  maxSteps = 8,
  stopWhen,
  ...settings
}: CreateSkChatAgentOptions) {
  const tools = createSkChatTools();

  return new ToolLoopAgent<SkChatAgentCallOptions, SkChatTools>({
    ...settings,
    tools,
    instructions,
    stopWhen: stopWhen ?? stepCountIs(maxSteps),
    prepareCall: ({ options }) => {
      const request = {
        ...options.request,
        skills: options.request.skills || skills,
      };
      const skillsPrompt = buildSkillsPrompt(request.skills || []);
      const selectedSkillInstruction = request.selectedSkillName
        ? `The user selected skill "${request.selectedSkillName}". Call load_skill with this name before answering.`
        : '';

      return {
        ...settings,
        tools,
        instructions: [
          request.systemPrompt || instructions,
          skillsPrompt,
          selectedSkillInstruction,
        ].filter(Boolean).join('\n\n'),
        stopWhen: stopWhen ?? stepCountIs(maxSteps),
        experimental_context: { request } satisfies SkChatAgentContext,
        messages: skChatRequestToModelMessages(request),
      };
    },
  });
}

export async function streamSkChatResponse({
  agent,
  request,
  abortSignal,
  init,
}: {
  agent: ReturnType<typeof createSkChatAgent>;
  request: SkChatRequest;
  abortSignal?: AbortSignal;
  init?: ResponseInit;
}) {
  const result = await agent.stream({
    prompt: request.message,
    options: { request },
    abortSignal,
  });

  return result.toTextStreamResponse(init);
}
