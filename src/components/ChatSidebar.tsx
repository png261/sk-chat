import { useMemo, useRef, useState } from 'react';
import {
  Layout,
  AlertCircle,
  Paperclip,
  RotateCw,
  X,
  Plus,
  Sparkle,
  ScreenShare,
  Square,
  History,
  ArrowUpRight,
  Globe,
  MessageSquare,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  unstable_useSlashCommandAdapter,
} from '@assistant-ui/react';
import { useSkChat } from '../hooks/useSkChat';
import { SelectionToolbar, ComposerQuotePreview } from './ui/quote';
import { UserMessage } from './ui/user-message';
import { AssistantMessage } from './ui/assistant-message';
import { UserEditComposer } from './ui/edit-composer';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { SkChatAttachment } from '../types';
import { cn } from '../utils/utils';
import { convertMessage } from './ToolCalls';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ScrollToBottom } from './ui/scroll-to-bottom';

export type SkChatSidebarProps = {
  title?: string;
  placeholder?: string;
  className?: string;
  enableFileUpload?: boolean;
  debug?: boolean;
};

export function SkChatSidebar({
  title = 'Trợ lý AI',
  placeholder = 'Nhập câu hỏi của bạn tại đây...',
  className,
  enableFileUpload = true,
}: SkChatSidebarProps) {
  const {
    isOpen,
    isLoading,
    error,
    messages,
    attachments,
    closeChat,
    sendMessage,
    editMessage,
    retryLastMessage,
    clearConversation,
    addFiles,
    removeAttachment,
    stopMessage,
    metadata,
    shareContext,
    submitUserResponse,
    skills,
    setSelectedSkillName,
    threads,
    activeThreadId,
    setActiveThreadId,
    isHistoryOpen,
    setIsHistoryOpen,
    createThread,
    deleteThread,
  } = useSkChat();

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === activeThreadId);
  }, [threads, activeThreadId]);
  
  const [panelMode, setPanelMode] = useState<'sidebar' | 'window'>('sidebar');
  const [windowPosition, setWindowPosition] = useState({ x: 32, y: 32 });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const runtimeRef = useRef<any>(null);

  const userName = useMemo(() => {
    return (metadata?.userName as string) || 'Phuong';
  }, [metadata]);

  const isThinking = useMemo(() => {
    if (!isLoading) return false;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return true;
    
    const hasContent = 
      (typeof lastMessage.content === 'string' && lastMessage.content.trim().length > 0) ||
      (Array.isArray(lastMessage.parts) && lastMessage.parts.length > 0);
    
    return !hasContent;
  }, [messages, isLoading]);

  const docTitle = useMemo(() => {
    return typeof document !== 'undefined' ? document.title : 'New Tab';
  }, []);

  const slash = unstable_useSlashCommandAdapter({
    commands: useMemo(() => {
      return skills.map((skill) => ({
        id: skill.name,
        label: skill.label || skill.name,
        description: skill.description || `Kích hoạt kỹ năng ${skill.name}`,
        execute: () => {
          setSelectedSkillName(skill.name);
          let prompt = `Hãy thực hiện kỹ năng: ${skill.label || skill.name}`;
          if (skill.name === 'explain-lesson') prompt = 'Giải thích bài học này giúp tôi';
          else if (skill.name === 'summarize-content') prompt = 'Tóm tắt nội dung trang này giúp tôi';
          else if (skill.name === 'practice-questions') prompt = 'Tạo một số câu hỏi luyện tập cho bài học này';
          else if (skill.name === 'solve-step-by-step') prompt = 'Giải từng bước bài tập này giúp tôi';
          
          runtimeRef.current?.composer.setText(prompt + ': ');
        }
      }));
    }, [skills, setSelectedSkillName])
  });

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: isLoading,
    onNew: async (msg) => {
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
      await sendMessage(text, [], { metadata: msg.metadata });
    },
    onCancel: async () => { stopMessage(); },
    convertMessage,
  });

  runtimeRef.current = runtime;

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    await addFiles(files);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!enableFileUpload) return;
    const files = event.clipboardData.files;
    if (files && files.length > 0) {
      event.preventDefault();
      await addFiles(files);
    }
  }

  const attachmentSummary = useMemo(
    () => attachments.map((attachment) => attachment.name).join(', '),
    [attachments],
  );

  function switchPanelMode() {
    if (panelMode === 'sidebar') {
      if (typeof window !== 'undefined') {
        const width = 460;
        setWindowPosition({
          x: Math.max(16, window.innerWidth - width - 24),
          y: 80,
        });
      }
      setPanelMode('window');
      return;
    }
    setPanelMode('sidebar');
  }

  function onHeaderPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (panelMode !== 'window') return;
    if ((event.target as HTMLElement).closest('button')) return;

    setIsDraggingSidebar(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = windowPosition;

    function onPointerMove(moveEvent: PointerEvent) {
      const width = 460;
      const height = 680;
      const nextX = Math.min(
        Math.max(16, startPosition.x + moveEvent.clientX - startX),
        Math.max(16, window.innerWidth - width - 16),
      );
      const nextY = Math.min(
        Math.max(16, startPosition.y + moveEvent.clientY - startY),
        Math.max(16, window.innerHeight - height - 16),
      );
      setWindowPosition({ x: nextX, y: nextY });
    }

    function onPointerUp() {
      setIsDraggingSidebar(false);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  const panelStyle =
    panelMode === 'window'
      ? {
          left: windowPosition.x,
          top: windowPosition.y,
          width: '460px',
          height: '680px',
          transition: isDraggingSidebar ? 'none' : undefined,
        }
      : {
          width: isOpen ? 'var(--sk-chat-sidebar-width, 420px)' : '0px',
        };

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <aside
          className={cn(
            'flex flex-col bg-background text-foreground border-border shadow-2xl transition-all duration-300 ease-in-out pointer-events-auto',
            panelMode === 'sidebar'
              ? cn(
                  'relative h-full border-l flex-shrink-0',
                  isOpen ? 'w-[var(--sk-chat-sidebar-width,420px)] opacity-100' : 'w-0 opacity-0 border-l-0 overflow-hidden'
                )
              : cn(
                  'fixed rounded-2xl overflow-hidden border z-[2147483600]',
                  isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
                ),
            className,
          )}
          style={panelStyle}
        >
          <header
            className={cn(
              'flex items-center justify-between px-4 py-3 border-b border-border bg-background select-none shrink-0',
              panelMode === 'window' ? 'cursor-move' : '',
            )}
            onPointerDown={onHeaderPointerDown}
            onDoubleClick={() => {
              if (panelMode === 'window') {
                setPanelMode('sidebar');
              }
            }}
          >
            <div className="flex items-center space-x-1.5">
              {isHistoryOpen ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs font-semibold flex items-center gap-1 text-muted-foreground hover:text-foreground border border-border/40 hover:bg-muted rounded-md"
                  onClick={() => setIsHistoryOpen(false)}
                  title="Quay lại chat"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Quay lại</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs font-semibold flex items-center gap-1 text-muted-foreground hover:text-foreground border border-border/40 hover:bg-muted rounded-md"
                  onClick={() => {
                    createThread();
                  }}
                  title="Tạo cuộc trò chuyện mới"
                >
                  <Plus className="size-3.5" />
                  <span>Mới</span>
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 transition-all duration-200 rounded-md",
                  isHistoryOpen
                    ? "text-blue-600 hover:text-blue-700 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-500/15"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                title="Lịch sử cuộc trò chuyện"
              >
                <History aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={switchPanelMode}
                title={panelMode === 'sidebar' ? 'Mở cửa sổ di động' : 'Ghim vào thanh bên'}
              >
                <Layout aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={closeChat}
                title="Đóng"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </header>

          {isHistoryOpen ? (
            <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground select-none">
              <div className="px-4 py-3 border-b border-border/40 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold text-foreground">
                  Lịch sử cuộc trò chuyện
                </h3>
                <Button
                  type="button"
                  onClick={() => {
                    createThread();
                    setIsHistoryOpen(false);
                  }}
                  className={cn(
                    "h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-semibold shadow-sm border-0",
                    "bg-blue-600 hover:bg-blue-700 text-white"
                  )}
                >
                  <Plus className="size-3.5" />
                  <span>Trò chuyện mới</span>
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {threads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4 text-center text-muted-foreground">
                    <MessageSquare className="size-10 opacity-30 mb-3" />
                    <p className="text-xs">Không có cuộc trò chuyện nào</p>
                  </div>
                ) : (
                  threads.map((thread) => {
                    const isActive = thread.id === activeThreadId;
                    return (
                      <div
                        key={thread.id}
                        className={cn(
                          "group relative rounded-xl p-3 text-left transition-all duration-200 flex flex-col gap-1.5 cursor-pointer border",
                          isActive
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500/40 dark:border-blue-500/30 shadow-sm"
                            : "bg-transparent border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                        )}
                        onClick={() => {
                          setActiveThreadId(thread.id);
                          setIsHistoryOpen(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <MessageSquare
                              className={cn(
                                "size-3.5 shrink-0 mt-0.5",
                                isActive ? "text-blue-500" : "text-slate-400 dark:text-slate-500"
                              )}
                            />
                            <span
                              className={cn(
                                "text-xs font-semibold truncate leading-tight",
                                isActive
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-slate-800 dark:text-slate-200"
                              )}
                            >
                                {thread.title}
                              </span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteThread(thread.id);
                              }}
                              className={cn(
                                "opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer border-0 bg-transparent shrink-0"
                              )}
                              title="Xóa cuộc trò chuyện"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>

                          {thread.url && (
                            <div className="flex items-center justify-between mt-0.5" onClick={(e) => e.stopPropagation()}>
                              <a
                                href={thread.url}
                                onClick={() => setIsHistoryOpen(false)}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium max-w-[90%] truncate"
                              >
                                <Globe className={cn("size-2.5 shrink-0", isActive ? "text-blue-500/80" : "text-slate-400 dark:text-slate-500")} />
                                <span className="truncate">{thread.pageTitle || 'Xem trang liên kết'}</span>
                              </a>
                              
                              <a
                                href={thread.url}
                                onClick={() => setIsHistoryOpen(false)}
                                className="inline-flex items-center justify-center size-5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                                title="Quay lại trang này"
                              >
                                <ArrowUpRight className="size-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col p-4 relative min-h-0">
                  <ThreadPrimitive.Root className="h-full flex flex-col justify-between flex-1 relative">
                    <ThreadPrimitive.Viewport className="flex-1 space-y-4 pr-1 overflow-y-auto">
                      {messages.length === 0 ? (
                        <div className="flex flex-col items-start justify-end h-full px-4 py-8 select-none">
                          <div className="space-y-0.5 mb-6 text-left">
                            <h1 className="text-3xl font-semibold text-blue-600 dark:text-blue-400 tracking-tight leading-tight">
                              Xin chào, {userName}
                            </h1>
                            <h2 className="text-3xl font-semibold text-slate-800 dark:text-slate-200 tracking-tight leading-tight">
                              Tôi có thể giúp gì cho bạn hôm nay?
                            </h2>
                          </div>
                          <div className="flex flex-col items-start gap-2 w-full">
                            <ThreadPrimitive.Suggestion prompt="Bạn có thể làm gì?" send asChild>
                              <button
                                type="button"
                                className="w-fit text-left px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-full text-sm font-medium transition-colors border-0 focus:outline-none"
                              >
                                Bạn có thể làm gì?
                              </button>
                            </ThreadPrimitive.Suggestion>
                            <ThreadPrimitive.Suggestion prompt="Tôi có thể hỏi những câu hỏi nào?" send asChild>
                              <button
                                type="button"
                                className="w-fit text-left px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-full text-sm font-medium transition-colors border-0 focus:outline-none"
                              >
                                Tôi có thể hỏi những câu hỏi nào?
                              </button>
                            </ThreadPrimitive.Suggestion>
                            <ThreadPrimitive.Suggestion prompt="Giúp tôi giải quyết một vấn đề" send asChild>
                              <button
                                type="button"
                                className="w-fit text-left px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-full text-sm font-medium transition-colors border-0 focus:outline-none"
                              >
                                Giúp tôi giải quyết một vấn đề
                              </button>
                            </ThreadPrimitive.Suggestion>
                          </div>
                        </div>
                      ) : (
                        <ThreadPrimitive.Messages>
                          {({ message }) => {
                            const isUser = message.role === 'user';
                            const isEditing = message.composer?.isEditing;

                            if (isUser && isEditing) {
                              return <UserEditComposer />;
                            }

                            return isUser
                              ? <UserMessage submitUserResponse={submitUserResponse} />
                              : <AssistantMessage submitUserResponse={submitUserResponse} />;
                          }}
                        </ThreadPrimitive.Messages>
                      )}

                      <ThreadPrimitive.ViewportFooter>
                        {isThinking && (
                          <div className="flex items-center gap-2 text-xs text-blue-500 font-medium pl-1.5 py-1 select-none animate-pulse">
                            <ScreenShare className="size-4 shrink-0" />
                            <span>Đang suy nghĩ...</span>
                          </div>
                        )}

                        {error && (
                          <div
                            className="flex items-start p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg space-x-2.5 text-xs mt-2"
                            role="alert"
                          >
                            <AlertCircle aria-hidden="true" className="mt-0.5 flex-shrink-0 size-4" />
                            <div className="flex-1 space-y-1">
                              <span className="font-semibold">Đã xảy ra lỗi:</span>
                              <p className="opacity-90">{error.message}</p>
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="xs"
                              onClick={retryLastMessage}
                              className="font-medium mt-1"
                            >
                              <RotateCw aria-hidden="true" className="mr-1 size-3" />
                              Thử lại
                            </Button>
                          </div>
                        )}
                      </ThreadPrimitive.ViewportFooter>
                    </ThreadPrimitive.Viewport>
                    <ScrollToBottom />
                    <SelectionToolbar />
                  </ThreadPrimitive.Root>
                </div>

                {attachments.length ? (
                  <div
                    className="flex flex-wrap gap-1.5 p-3 border-t border-border bg-muted/10 shrink-0"
                    aria-label={`Attached files: ${attachmentSummary}`}
                  >
                    {attachments.map((attachment: SkChatAttachment) => (
                      <button
                        key={attachment.name}
                        type="button"
                        onClick={() => removeAttachment(attachment.name)}
                        className="inline-flex items-center px-2.5 py-1 text-xs border border-border bg-background rounded-full hover:bg-destructive/15 hover:border-destructive/30 hover:text-destructive transition-colors group focus:outline-none"
                      >
                        <Paperclip
                          aria-hidden="true"
                          className="mr-1.5 text-muted-foreground group-hover:text-destructive transition-colors size-3"
                        />
                        <span className="truncate max-w-[120px] font-medium">{attachment.name}</span>
                        <X
                          aria-hidden="true"
                          className="ml-1.5 text-muted-foreground group-hover:text-destructive transition-colors size-3"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}

                <ComposerPrimitive.Unstable_TriggerPopoverRoot>
                  <ComposerPrimitive.Root className="p-3 border-t border-border bg-background flex flex-col gap-2 shrink-0 relative">
                    <ComposerQuotePreview />
                    <div className="border border-border/80 rounded-xl bg-background p-2 flex flex-col focus-within:ring-1 focus-within:ring-ring focus-within:border-ring shadow-sm transition-all duration-200">
                      <ComposerPrimitive.Input placeholder={shareContext ? "Nhập @ để hỏi về tab hiện tại" : placeholder} rows={1} disabled={isLoading} onPaste={onPaste} asChild>
                        <Textarea
                          className="w-full bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:outline-none resize-none px-2 py-1 text-sm outline-none placeholder:text-muted-foreground min-h-[40px] max-h-24 leading-tight shadow-none border-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              const form = e.currentTarget.closest('form');
                              if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                            }
                          }}
                        />
                      </ComposerPrimitive.Input>
                      <div className="flex items-center justify-between mt-2.5 px-1 select-none">
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => fileRef.current?.click()}
                            title="Tải lên tệp/ảnh"
                          >
                            <Plus className="size-4" />
                          </Button>
                          {enableFileUpload && (
                            <input
                              ref={fileRef}
                              className="hidden"
                              type="file"
                              multiple
                              onChange={(event) => onFilesSelected(event.target.files)}
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isLoading ? (
                            <ComposerPrimitive.Cancel asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-8 rounded-full border-primary/45 hover:bg-primary/10 text-primary hover:text-primary shrink-0"
                                title="Dừng hoạt động"
                              >
                                <Square aria-hidden="true" className="size-3 fill-primary text-primary" />
                              </Button>
                            </ComposerPrimitive.Cancel>
                          ) : (
                            <ComposerPrimitive.Send asChild>
                              <Button
                                type="submit"
                                size="icon"
                                className="size-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border-0 shadow-none shrink-0"
                                title="Gửi"
                              >
                                <Sparkle aria-hidden="true" className="size-4" />
                              </Button>
                            </ComposerPrimitive.Send>
                          )}
                        </div>
                      </div>
                    </div>

                    <ComposerPrimitive.Unstable_TriggerPopover
                      char="/"
                      adapter={slash.adapter}
                      className="absolute bottom-full left-3 right-3 mb-2 bg-popover text-popover-foreground rounded-lg border border-border shadow-lg p-1 z-50 flex flex-col max-h-60 overflow-y-auto"
                    >
                      <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
                      <ComposerPrimitive.Unstable_TriggerPopoverItems>
                        {(items) =>
                          items.map((item, index) => (
                            <ComposerPrimitive.Unstable_TriggerPopoverItem
                              key={item.id}
                              item={item}
                              index={index}
                              className="flex flex-col items-start px-3 py-2 text-xs rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer select-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                            >
                              <strong className="text-sm font-semibold">/{item.id}</strong>
                              {item.description && <span className="text-muted-foreground mt-0.5">{item.description}</span>}
                            </ComposerPrimitive.Unstable_TriggerPopoverItem>
                          ))
                        }
                      </ComposerPrimitive.Unstable_TriggerPopoverItems>
                    </ComposerPrimitive.Unstable_TriggerPopover>
                  </ComposerPrimitive.Root>
                </ComposerPrimitive.Unstable_TriggerPopoverRoot>
              </>
            )}
        </aside>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}

export const ChatSidebar = SkChatSidebar;
