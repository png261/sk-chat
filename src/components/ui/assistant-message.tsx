import { MessagePrimitive } from '@assistant-ui/react';
import { AssistantActionBar } from './message-actions';
import { StreamdownText } from './streamdown-text';
import { ChainOfThought } from './chain-of-thought';
import { ToolFallback } from './tool-fallback';
import { Sources } from './sources';
import {
  ComputerToolCall,
  GetWebContentToolCall,
  LoadSkillToolCall,
} from '../ToolCalls';

interface AssistantMessageProps {
  submitUserResponse: (toolCallId: string, response: string) => void;
}

export function AssistantMessage({ submitUserResponse }: AssistantMessageProps) {
  return (
    <MessagePrimitive.Root className="relative flex flex-col w-full max-w-full rounded-2xl px-4 py-2.5 text-sm shadow-none mb-4 group bg-transparent text-foreground mr-auto">
      <div className="prose prose-sm dark:prose-invert break-words max-w-full leading-relaxed w-full">
        <MessagePrimitive.Content
          components={{
            Text: StreamdownText,
            Source: Sources,
            Reasoning: ({ text }) => (
              <ChainOfThought>{text}</ChainOfThought>
            ),
            tools: {
              by_name: {
                computer: ({ args, result }) => (
                  <ComputerToolCall args={args} result={result} />
                ),
                get_web_content: ({ args, result }) => (
                  <GetWebContentToolCall args={args} result={result} />
                ),
                load_skill: ({ args, result }) => (
                  <LoadSkillToolCall args={args} result={result} />
                ),
              },
              Fallback: ToolFallback,
            },
          }}
        />
      </div>
      <AssistantActionBar />
    </MessagePrimitive.Root>
  );
}

AssistantMessage.displayName = 'AssistantMessage';
