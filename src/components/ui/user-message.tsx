import { MessagePrimitive, groupPartByType } from '@assistant-ui/react';
import { Paperclip } from 'lucide-react';
import { QuoteBlock } from './quote';
import { StreamdownText } from './streamdown-text';
import { ToolGroup } from './tool-group';
import { ToolFallback } from './tool-fallback';
import {
  ComputerToolCall,
  GetWebContentToolCall,
  LoadSkillToolCall,
} from '../ToolCalls';

interface UserMessageProps {
  submitUserResponse: (toolCallId: string, response: string) => void;
}

export function UserMessage({ submitUserResponse }: UserMessageProps) {
  return (
    <MessagePrimitive.Root
      className="flex flex-col w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-none mb-4 group bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ml-auto rounded-tr-sm border border-border/50"
    >
      <div className="prose prose-sm dark:prose-invert break-words max-w-full leading-relaxed w-full">
        <MessagePrimitive.Quote>
          {(quote) => <QuoteBlock {...quote} />}
        </MessagePrimitive.Quote>
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            'tool-call': ['group-tool'],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case 'group-tool':
                return <ToolGroup>{children}</ToolGroup>;
              case 'text':
                return <StreamdownText {...part} />;
              case 'tool-call':
                switch (part.toolName) {
                  case 'computer':
                    return <ComputerToolCall args={part.args} result={part.result} />;
                  case 'get_web_content':
                    return <GetWebContentToolCall args={part.args} result={part.result} />;
                  case 'load_skill':
                    return <LoadSkillToolCall args={part.args} result={part.result} />;
                  default:
                    return <ToolFallback {...part} />;
                }
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <span className="inline-flex items-center text-[11px] bg-current/10 px-2 py-0.5 rounded-full">
              <Paperclip className="mr-1 opacity-70 size-3" />
              {attachment.name}
            </span>
          )}
        </MessagePrimitive.Attachments>
      </div>
    </MessagePrimitive.Root>
  );
}

UserMessage.displayName = 'UserMessage';
