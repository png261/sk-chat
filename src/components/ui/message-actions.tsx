import { useState, useEffect } from 'react';
import { ActionBarPrimitive, useMessage } from '@assistant-ui/react';
import { Check, Copy, RotateCw, ThumbsUp, ThumbsDown, Flag } from 'lucide-react';
import { cn } from '../../utils/utils';
import { ReportDialog } from './report-dialog';

export function UserActionBar() {
  return null;
}

UserActionBar.displayName = 'UserActionBar';

export function AssistantActionBar() {
  const message = useMessage();
  const messageId = message.id;
  const hasToolCall = message.content.some((part: any) => part.type === 'tool-call');

  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => {
    if (!messageId) return;
    try {
      const stored = localStorage.getItem('sk-chat-message-reactions');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed[messageId]) {
          setReaction(parsed[messageId]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [messageId]);

  const handleLike = () => {
    const newReaction = reaction === 'like' ? null : 'like';
    setReaction(newReaction);
    try {
      const stored = localStorage.getItem('sk-chat-message-reactions');
      const parsed = stored ? JSON.parse(stored) : {};
      if (newReaction) {
        parsed[messageId] = newReaction;
      } else {
        delete parsed[messageId];
      }
      localStorage.setItem('sk-chat-message-reactions', JSON.stringify(parsed));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDislike = () => {
    const newReaction = reaction === 'dislike' ? null : 'dislike';
    setReaction(newReaction);
    try {
      const stored = localStorage.getItem('sk-chat-message-reactions');
      const parsed = stored ? JSON.parse(stored) : {};
      if (newReaction) {
        parsed[messageId] = newReaction;
      } else {
        delete parsed[messageId];
      }
      localStorage.setItem('sk-chat-message-reactions', JSON.stringify(parsed));
    } catch (e) {
      console.error(e);
    }
  };

  if (message.status?.type === 'running') return null;
  if (hasToolCall) return null;

  return (
    <ActionBarPrimitive.Root
      autohide="not-last"
      autohideFloat="always"
      className={cn(
        'flex items-center gap-1 mt-2 pt-1.5 select-none',
        'data-[floating]:absolute data-[floating]:bottom-0 data-[floating]:right-0',
        'data-[floating]:bg-background/90 data-[floating]:backdrop-blur-sm',
        'data-[floating]:border data-[floating]:border-border/50 data-[floating]:rounded-lg data-[floating]:px-1.5 data-[floating]:py-1 data-[floating]:shadow-sm',
        'data-[floating]:opacity-0 data-[floating]:group-hover:opacity-100 data-[floating]:transition-opacity',
      )}
    >
      <ActionBarPrimitive.Copy asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center size-7 rounded-md transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
            'data-[copied]:text-green-600 dark:data-[copied]:text-green-400',
          )}
          title="Sao chép"
        >
          <span className="data-[copied]:hidden contents">
            <Copy className="size-3.5" />
          </span>
          <span className="hidden data-[copied]:contents">
            <Check className="size-3.5" />
          </span>
        </button>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center size-7 rounded-md transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
          title="Tạo lại"
        >
          <RotateCw className="size-3.5" />
        </button>
      </ActionBarPrimitive.Reload>

      <button
        type="button"
        onClick={handleLike}
        className={cn(
          'inline-flex items-center justify-center size-7 rounded-md transition-colors',
          reaction === 'like'
            ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/15'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
        title="Thích"
      >
        <ThumbsUp className={cn("size-3.5", reaction === 'like' && 'fill-current')} />
      </button>

      <button
        type="button"
        onClick={handleDislike}
        className={cn(
          'inline-flex items-center justify-center size-7 rounded-md transition-colors',
          reaction === 'dislike'
            ? 'text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/15'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
        title="Không thích"
      >
        <ThumbsDown className={cn("size-3.5", reaction === 'dislike' && 'fill-current')} />
      </button>

      {messageId && (
        <ReportDialog messageId={messageId}>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center size-7 rounded-md transition-colors',
              'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
            )}
            title="Báo cáo"
          >
            <Flag className="size-3.5" />
          </button>
        </ReportDialog>
      )}
    </ActionBarPrimitive.Root>
  );
}

AssistantActionBar.displayName = 'AssistantActionBar';

