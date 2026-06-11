import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMessage } from '@assistant-ui/react';
import { Button } from './ui/button';
import { cn } from '../utils/utils';
import type { SkChatMessage } from '../types';

export const convertMessage = (msg: SkChatMessage) => ({
  id: msg.id,
  role: msg.role,
  content: msg.parts
    ? msg.parts.map((part) => {
        if (part.type === 'tool-call') {
          return {
            type: 'tool-call' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args,
            result: part.result,
          };
        }
        if (part.type === 'reasoning') {
          return {
            type: 'reasoning' as const,
            text: part.text,
          };
        }
        return {
          type: 'text' as const,
          text: part.text,
        };
      })
    : [{ type: 'text' as const, text: msg.content }],
  attachments: msg.attachments?.map((att) => ({
    id: att.name,
    name: att.name,
    contentType: att.type,
    type: (att.type.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
    status: { type: 'complete' as const },
    content: [],
    data: att.data,
  })),
});



export function ScreenshotToolCall({ result }: { result: any }) {
  const isRunning = !result;
  let message: any = null;
  try {
    message = useMessage();
  } catch (e) {
    // Ignore outside of Message context
  }

  const screenshotAttachment = message?.attachments?.find(
    (att: any) =>
      (att.contentType === 'image/jpeg' || att.name?.startsWith('screenshot-')) &&
      att.data,
  );

  const imageUrl =
    result && String(result).startsWith('data:image/')
      ? result
      : screenshotAttachment?.data;

  return (
    <div className="flex flex-col gap-2 mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-border/80 shadow-sm text-xs w-full">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground flex items-center gap-1.5">
          📸 Chụp ảnh màn hình
        </span>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1',
            isRunning 
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' 
              : 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
          )}
        >
          {isRunning ? (
            <>
              <span className="animate-spin mr-1">🔄</span>
              Đang chạy...
            </>
          ) : (
            <>
              <span className="mr-0.5">✓</span>
              Hoàn thành
            </>
          )}
        </span>
      </div>
      
      <div className="text-muted-foreground text-[11px] leading-relaxed">
        {isRunning ? 'Đang chụp ảnh màn hình hiện tại...' : 'Đã chụp màn hình thành công'}
      </div>

      {imageUrl && (
        <div className="mt-2 rounded-lg overflow-hidden border border-border shadow-sm max-w-[280px]">
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" title="Click to view full image">
            <img src={imageUrl} alt="Captured Screenshot" className="w-full h-auto object-cover max-h-[160px] hover:opacity-90 transition-opacity" />
          </a>
        </div>
      )}
    </div>
  );
}

export function GetWebContentToolCall({ args, result }: { args: any; result: any }) {
  const isRunning = !result;
  const [isExpanded, setIsExpanded] = useState(false);

  const charCount = result ? result.length : 0;

  return (
    <div className="flex flex-col gap-2 mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-border/80 shadow-sm text-xs w-full">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground flex items-center gap-1.5">
          📖 Đọc nội dung trang
        </span>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1',
            isRunning 
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' 
              : 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
          )}
        >
          {isRunning ? (
            <>
              <span className="animate-spin mr-1">🔄</span>
              Đang chạy...
            </>
          ) : (
            <>
              <span className="mr-0.5">✓</span>
              Hoàn thành
            </>
          )}
        </span>
      </div>

      <div className="text-muted-foreground text-[11px] leading-relaxed">
        {isRunning ? 'Đang đọc và phân tích toàn bộ văn bản/HTML trên trang...' : `Đã đọc xong nội dung trang (${charCount.toLocaleString()} ký tự).`}
      </div>

      {result && (
        <div className="mt-1 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-500 hover:text-blue-600 font-medium text-[11px] w-fit focus:outline-none"
          >
            {isExpanded ? ' Thu nhỏ kết quả' : ' Xem trước kết quả'}
          </button>
          
          {isExpanded && (
            <div className="mt-1 text-muted-foreground text-[10px] bg-white dark:bg-slate-950 p-2 rounded-lg border border-border/80 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap leading-normal">
              {result.slice(0, 500)}
              {result.length > 500 ? '...' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LoadSkillToolCall({ args, result }: { args: any; result: any }) {
  const isRunning = !result;
  const skillName = args?.name || '';

  return (
    <div className="flex flex-col gap-2 mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-border/80 shadow-sm text-xs w-full">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground flex items-center gap-1.5">
          ⚙️ Tải kỹ năng học tập
        </span>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1',
            isRunning 
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' 
              : 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
          )}
        >
          {isRunning ? (
            <>
              <span className="animate-spin mr-1">🔄</span>
              Đang chạy...
            </>
          ) : (
            <>
              <span className="mr-0.5">✓</span>
              Hoàn thành
            </>
          )}
        </span>
      </div>

      <div className="text-muted-foreground text-[11px] leading-relaxed">
        {isRunning ? `Đang tìm kiếm và tải kỹ năng: "${skillName}"...` : `Đã tải thành công kỹ năng: "${skillName}"`}
      </div>

      {result && (
        <div className="mt-1 text-muted-foreground text-[10px] bg-white dark:bg-slate-950 p-2 rounded-lg border border-border/80 max-h-24 overflow-y-auto leading-normal">
          {result}
        </div>
      )}
    </div>
  );
}
