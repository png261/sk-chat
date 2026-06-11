import type { FC, PropsWithChildren } from 'react';
import { Brain } from 'lucide-react';
import { cn } from '../../utils/utils';

export const ChainOfThought: FC<PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <details
    className={cn(
      'border border-border/60 rounded-lg p-2.5 my-2 bg-muted/20 transition-colors open:bg-muted/30',
      className,
    )}
  >
    <summary className="cursor-pointer text-xs text-muted-foreground font-medium flex items-center gap-1.5 select-none hover:text-foreground transition-colors">
      <Brain className="size-3.5 shrink-0" />
      <span>Suy luận</span>
    </summary>
    <div className="mt-2 text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
      {children}
    </div>
  </details>
);

ChainOfThought.displayName = 'ChainOfThought';
