import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
  attachments: msg.role === 'user' ? msg.attachments?.map((att) => ({
    id: att.name,
    name: att.name,
    contentType: att.type,
    type: (att.type.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
    status: { type: 'complete' as const },
    content: [],
  })) : undefined,
});

interface AskUserToolCallProps {
  part: any;
  submitUserResponse: (toolCallId: string, response: string) => void;
}

export function AskUserToolCall({ part, submitUserResponse }: AskUserToolCallProps) {
  const [customVal, setCustomVal] = useState('');
  const isPending = !part.result;

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customVal.trim()) return;
    submitUserResponse(part.toolCallId, customVal.trim());
  };

  const handleSelectOption = (option: string) => {
    submitUserResponse(part.toolCallId, option);
  };

  if (!isPending) {
    return (
      <div className="flex flex-col items-start gap-1 p-3 bg-white dark:bg-slate-900 rounded-xl border border-border/80 shadow-sm mt-2 text-xs">
        <span className="text-muted-foreground font-medium">Lựa chọn của bạn:</span>
        <strong className="text-foreground text-sm font-semibold">{part.result}</strong>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3.5 bg-white dark:bg-slate-900 border border-border/80 rounded-xl mt-2 text-left shadow-sm w-full">
      <div className="text-sm font-semibold text-foreground leading-snug">{part.args.question}</div>
      <div className="flex flex-wrap gap-1.5">
        {part.args.options?.map((opt: string, i: number) => (
          <Button
            key={i}
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-3"
            onClick={() => handleSelectOption(opt)}
          >
            {opt}
          </Button>
        ))}
      </div>
      <form onSubmit={handleSubmitCustom} className="flex gap-2 mt-1">
        <input
          type="text"
          className="flex-1 px-3 py-1.5 text-xs border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Nhập lựa chọn khác..."
          value={customVal}
          onChange={(e) => setCustomVal(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
        >
          Gửi
        </Button>
      </form>
    </div>
  );
}

export function ComputerToolCall({ args, result }: { args: any; result: any }) {
  const action = args?.action;
  const isRunning = !result;

  let label = '⚙️ Công cụ hệ thống';
  let detail = '';
  if (action === 'screenshot') {
    label = '📸 Chụp ảnh màn hình';
    detail = isRunning ? 'Đang chụp ảnh màn hình hiện tại...' : 'Đã chụp màn hình thành công';
  } else if (action === 'mouse_move') {
    label = '🖱️ Di chuyển con trỏ';
    const coords = args?.coordinate ? `(${args.coordinate.join(', ')})` : '';
    detail = isRunning ? `Đang di chuyển con trỏ tới tọa độ ${coords}...` : `Đã di chuyển con trỏ tới tọa độ ${coords}`;
  } else if (action === 'left_click') {
    label = '🖱️ Nhấp chuột';
    const coords = args?.coordinate ? `(${args.coordinate.join(', ')})` : '';
    detail = isRunning ? `Đang nhấp chuột tại tọa độ ${coords}...` : `Đã nhấp chuột tại tọa độ ${coords}`;
  } else if (action === 'type') {
    label = '⌨️ Nhập liệu';
    detail = isRunning ? `Đang hướng dẫn nhập: "${args?.text}"...` : `Đã hướng dẫn nhập: "${args?.text}"`;
  }

  return (
    <div className="flex flex-col gap-2 mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-border/80 shadow-sm text-xs w-full">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground flex items-center gap-1.5">
          {label}
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
        {detail}
      </div>

      {action === 'screenshot' && result && (
        <div className="mt-2 rounded-lg overflow-hidden border border-border shadow-sm max-w-[280px]">
          <a href={result} target="_blank" rel="noopener noreferrer" title="Click to view full image">
            <img src={result} alt="Captured Screenshot" className="w-full h-auto object-cover max-h-[160px] hover:opacity-90 transition-opacity" />
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
