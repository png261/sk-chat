# sk-chat

`sk-chat` is a React package for adding an AI chat assistant to a scoped part of a website. Wrap lesson content, docs, exercises, or LMS pages with `SkChatProvider`; the package captures that DOM region, converts it to markdown, can screenshot it, and sends the context to your AI endpoint.

The package ships a default floating chat button and sidebar, plus `useSkChat` for custom controls.

## Install

```bash
pnpm add sk-chat @assistant-ui/react @assistant-ui/react-ai-sdk @ai-sdk/react ai
pnpm add turndown html-to-image react-markdown lucide-react
```

For a backend provider, install the provider package you use:

```bash
pnpm add @ai-sdk/openai
```

## Basic Usage

```tsx
import { SkChatProvider } from 'sk-chat';
import 'sk-chat/style.css';

const skills = [
  {
    name: 'explain-lesson',
    label: 'Giải thích bài',
    description: 'Explain the current lesson with examples and step-by-step reasoning.',
    content: '# Explain Lesson\n\nExplain in Vietnamese and cite the page context.',
  },
  {
    name: 'practice-questions',
    label: 'Câu hỏi luyện tập',
    description: 'Create practice questions from the current lesson.',
    content: '# Practice Questions\n\nCreate 3-5 questions with answer keys.',
  },
];

export default function LessonPage() {
  return (
    <SkChatProvider apiEndpoint="/api/sk-chat" skills={skills}>
      <main>
        <h1>Fractions</h1>
        <p>1/2 = 2/4 = 3/6</p>
      </main>
    </SkChatProvider>
  );
}
```

The provider renders a floating chat icon in the lower-right corner. Opening chat refreshes the captured context from the wrapped content.

## Provider And Model

```tsx
<SkChatProvider
  apiEndpoint="/api/sk-chat"
  provider="openai"
  model="gpt-4.1"
  systemPrompt="Ban la tro ly hoc tap. Hay huong dan tung buoc."
  metadata={{ lessonId: 'lesson-001', userId: 'user-001' }}
>
  {children}
</SkChatProvider>
```

`provider` and `model` are passed through to your backend. The package does not hard-code a provider.

## Next.js API Route

```ts
// app/api/sk-chat/route.ts
import { openai } from '@ai-sdk/openai';
import { createSkChatAgent, streamSkChatResponse } from 'sk-chat';

export const maxDuration = 30;

const agent = createSkChatAgent({
  model: openai('gpt-4.1'),
});

export async function POST(req: Request) {
  const body = await req.json();

  return streamSkChatResponse({
    agent,
    request: body,
  });
}
```

`createSkChatAgent` uses the AI SDK `ToolLoopAgent` and defines these tools once:

- `load_skill`: loads selected skill instructions only when needed.
- `get_web_content`: returns the captured markdown/html context.
- `get_screenshot`: returns the captured screenshot data URL when available.
- `ask_user`: prepares a clarifying question for the assistant to ask.

The chat composer shows a skill dropdown. When the user chooses a skill, the client sends `selectedSkillName` plus the available `skills`; the agent prompt tells `ToolLoopAgent` to call `load_skill` before answering.

If you need per-request models, create the agent inside the route:

```ts
export async function POST(req: Request) {
  const body = await req.json();
  const agent = createSkChatAgent({
    model: openai(body.model || 'gpt-4.1'),
  });

  return streamSkChatResponse({ agent, request: body });
}
```

The complete example is in `examples/nextjs`.

## Skills

`sk-chat` includes default learning skills:

- `explain-lesson`
- `summarize-content`
- `practice-questions`
- `solve-step-by-step`

Override them by passing `skills` to `SkChatProvider`:

```tsx
<SkChatProvider
  apiEndpoint="/api/sk-chat"
  skills={[
    {
      name: 'exam-coach',
      label: 'Luyện thi',
      description: 'Coach students through exam-style questions.',
      content: `# Exam Coach

Use concise Vietnamese. Ask the student to solve first, then give hints before the full solution.`,
    },
  ]}
>
  {children}
</SkChatProvider>
```

You can also create the server agent with custom default skills:

```ts
const agent = createSkChatAgent({
  model: openai('gpt-4.1'),
  skills: [
    {
      name: 'exam-coach',
      description: 'Coach students through exam-style questions.',
      content: '# Exam Coach\n\nGive hints before the full solution.',
    },
  ],
});
```

## Screenshot

Screenshots are enabled by default through `html-to-image`.

```tsx
<SkChatProvider enableScreenshot={false}>{children}</SkChatProvider>
```

You can also disable markdown context:

```tsx
<SkChatProvider enableMarkdownContext={false}>{children}</SkChatProvider>
```

## Memory

Local memory persists messages in `localStorage` by conversation id.

```tsx
<SkChatProvider memory={{ type: 'local', conversationId: 'lesson-001' }}>
  {children}
</SkChatProvider>
```

Remote memory sends `conversationId` to your backend so you can persist history there.

```tsx
<SkChatProvider memory={{ type: 'remote', conversationId: 'server-thread-001' }}>
  {children}
</SkChatProvider>
```

Disable memory:

```tsx
<SkChatProvider memory={{ type: 'none' }}>{children}</SkChatProvider>
```

## File And Image Upload

File upload is enabled by default. Files are converted to:

```ts
type Attachment = {
  name: string;
  type: string;
  size: number;
  data?: string;
  url?: string;
};
```

Disable it with:

```tsx
<SkChatProvider enableFileUpload={false}>{children}</SkChatProvider>
```

## Hook

```tsx
import { useSkChat } from 'sk-chat';

function CustomButton() {
  const { refreshContext, openChat, markdown, screenshot } = useSkChat();

  return (
    <button
      onClick={async () => {
        await refreshContext();
        openChat();
      }}
    >
      Ask AI
    </button>
  );
}
```

## Theme

```tsx
<SkChatProvider
  theme={{
    primaryColor: '#2563eb',
    borderRadius: '12px',
    sidebarWidth: '460px',
    zIndex: 70,
  }}
>
  {children}
</SkChatProvider>
```

You can also pass `className`, `contentClassName`, `sidebarClassName`, and `buttonClassName`.

## LMS Example

```tsx
<SkChatProvider
  apiEndpoint="/api/sk-chat"
  provider="openai"
  model="gpt-4.1"
  metadata={{ lessonId, unitId, userId }}
  memory={{ type: 'local', conversationId: lessonId }}
>
  <LessonContent lesson={lesson} />
  <ExerciseList exercises={exercises} />
</SkChatProvider>
```

Each message sends the current markdown context, optional screenshot, attachments, conversation history, metadata, provider, and model to the backend.
