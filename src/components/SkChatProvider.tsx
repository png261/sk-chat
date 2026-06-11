import { PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import { CodexPetProvider, CodexPet } from 'codex-pet-web-react';
import { SkChatSidebar } from './ChatSidebar';
import { SkChatContext } from '../hooks/useSkChat';
import { cn } from '../utils/utils';
import type { SkChatProviderProps } from '../types';
import { useSkChatManager } from '../hooks/useSkChatManager';

export function SkChatProvider(props: PropsWithChildren<SkChatProviderProps>) {
  const {
    children,
    title,
    placeholder,
    enableFileUpload = true,
    debug = false,
    className,
    contentClassName,
    sidebarClassName,
    buttonClassName,
  } = props;

  const {
    contentRef,
    petRef,
    isDraggingRef,
    isOpen,
    setIsOpen,
    canPortalControls,
    value,
    style,
    speechText,
    showSpeechBubble,
    petPositionStyle,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useSkChatManager(props);

  const controls = (
    <div className="fixed inset-0 pointer-events-none z-[2147483600]" style={style}>
      <div
        className={cn(
          "fixed z-[2147483600] flex items-center justify-center pointer-events-auto cursor-grab hover:scale-105 active:scale-95 transition-all duration-200",
          buttonClassName
        )}
        style={petPositionStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => {
          if (isDraggingRef.current) {
            e.preventDefault();
            e.stopPropagation();
            isDraggingRef.current = false;
            return;
          }

          if (isOpen) {
            setIsOpen(false);
          } else {
            void value.refreshContext().catch((cause) => {
              console.warn('sk-chat: cannot refresh context before opening', cause);
            });
            setIsOpen(true);
          }
        }}
        title={isOpen ? "Đóng cuộc trò chuyện" : "Trò chuyện with AI"}
      >
        {showSpeechBubble && (
          <div
            className="absolute bottom-[105%] mb-3 backdrop-blur-sm rounded-2xl border shadow-2xl min-w-[160px] max-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer pointer-events-auto select-none"
            style={{
              backgroundColor: '#0f172a',
              color: '#ffffff',
              borderColor: '#1e293b',
              padding: '10px 14px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              void value.refreshContext().catch((cause) => {
                console.warn('sk-chat: cannot refresh context before opening', cause);
              });
              setIsOpen(true);
            }}
          >
            <div className="leading-relaxed font-medium text-xs line-clamp-3">
              {speechText}
            </div>
            {/* Arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent"
              style={{ borderTopColor: '#0f172a' }}
            />
          </div>
        )}
        <CodexPet ref={petRef} id="assistant" aria-label="Virtual Pet" />
      </div>
    </div>
  );

  return (
    <CodexPetProvider
      pets={{
        assistant: {
          draggable: false,
          floating: false,
          fps: 8,
          scale: 0.5,
          spritesheetUrl: "https://froemic.github.io/codex-pets-web/pets/bandit/spritesheet.webp",
          stateFps: { idle: 3 }
        }
      }}
    >
      <SkChatContext.Provider value={value}>
        <div className={cn('flex w-full h-full relative overflow-hidden', className)} style={style}>
          <div ref={contentRef} className={cn('flex-1 h-full min-w-0 transition-all duration-300', contentClassName)}>
            {children}
          </div>
          <SkChatSidebar
            title={title}
            placeholder={placeholder}
            className={sidebarClassName}
            enableFileUpload={enableFileUpload}
            debug={debug}
          />
          {canPortalControls ? createPortal(controls, document.body) : controls}
        </div>
      </SkChatContext.Provider>
    </CodexPetProvider>
  );
}
