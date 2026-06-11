import {
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react';
import { Button } from './button';
import { Textarea } from './textarea';

export function UserEditComposer() {
  return (
    <MessagePrimitive.Root className="flex flex-col w-full max-w-full ml-auto mb-4 bg-background border border-border/80 rounded-xl p-2 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring shadow-sm transition-all duration-200">
      <ComposerPrimitive.Root className="flex flex-col gap-2 relative">
        <ComposerPrimitive.Input rows={1} autoFocus asChild>
          <Textarea className="w-full bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:outline-none resize-none px-2 py-1 text-sm outline-none placeholder:text-muted-foreground min-h-[40px] max-h-24 leading-tight shadow-none border-none" />
        </ComposerPrimitive.Input>
        <div className="flex justify-end gap-1.5 px-1 mt-1.5 select-none">
          <ComposerPrimitive.Cancel asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs font-medium">
              Hủy
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button type="submit" size="sm" className="h-8 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              Lưu & gửi
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

UserEditComposer.displayName = 'UserEditComposer';
