import { ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDown } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../utils/utils';

export function ScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "absolute bottom-4 right-4 z-50 rounded-full shadow-md bg-background/90 text-foreground border border-border size-9 flex items-center justify-center transition-all hover:bg-muted",
          "disabled:opacity-0 disabled:pointer-events-none transition-opacity duration-300"
        )}
        title="Cuộn xuống dưới"
      >
        <ArrowDown className="size-4" />
      </Button>
    </ThreadPrimitive.ScrollToBottom>
  );
}

ScrollToBottom.displayName = 'ScrollToBottom';
