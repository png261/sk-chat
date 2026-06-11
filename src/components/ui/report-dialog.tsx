import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from './dialog';
import { Button } from './button';
import { Textarea } from './textarea';
import { cn } from '../../utils/utils';

interface ReportDialogProps {
  messageId: string;
  children: React.ReactNode;
}

export function ReportDialog({ messageId, children }: ReportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<string>('Sai thông tin');
  const [description, setDescription] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const reportData = {
      messageId,
      category,
      description,
      timestamp: new Date().toISOString(),
    };

    // Log to console
    console.log('Report submitted:', reportData);

    // Save to local storage
    try {
      const stored = localStorage.getItem('sk-chat-message-reports');
      const reports = stored ? JSON.parse(stored) : [];
      reports.push(reportData);
      localStorage.setItem('sk-chat-message-reports', JSON.stringify(reports));
    } catch (e) {
      console.error('Failed to save report to local storage', e);
    }

    setIsSubmitted(true);
    setTimeout(() => {
      setIsOpen(false);
      // Reset state after closing
      setTimeout(() => {
        setIsSubmitted(false);
        setCategory('Sai thông tin');
        setDescription('');
      }, 300);
    }, 1500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[400px] bg-white dark:bg-slate-900 border border-border p-5 rounded-2xl text-slate-900 dark:text-slate-100 shadow-2xl focus:outline-none">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-sm font-semibold select-none text-slate-900 dark:text-slate-100">
            Báo cáo phản hồi của AI
          </DialogTitle>
        </DialogHeader>

        {isSubmitted ? (
          <div className="flex flex-col items-center justify-center py-6 text-center select-none">
            <span className="text-green-500 text-3xl mb-2">✓</span>
            <p className="text-xs font-semibold text-green-600 dark:text-green-400">
              Báo cáo thành công!
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Cảm ơn bạn đã phản hồi để cải thiện hệ thống.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 select-none">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Lý do báo cáo
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['Sai thông tin', 'Không phù hợp', 'Spam/Quảng cáo', 'Khác'].map((cat) => (
                  <label
                    key={cat}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/40",
                      category === cat
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
                        : "border-border/60 bg-transparent text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <input
                      type="radio"
                      name="report-category"
                      value={cat}
                      checked={category === cat}
                      onChange={() => setCategory(cat)}
                      className="sr-only"
                    />
                    <span>{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                Chi tiết phản hồi
              </label>
              <Textarea
                placeholder="Vui lòng mô tả thêm chi tiết lỗi hoặc nội dung chưa phù hợp..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-20 text-xs bg-slate-50/50 dark:bg-slate-950/20 border-border/80 rounded-xl resize-none outline-none focus:border-blue-500 p-2.5"
                required={category === 'Khác'}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 select-none">
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="sm" className="h-9 text-xs font-semibold">
                  Hủy
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                className="h-9 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm border-0"
              >
                Gửi báo cáo
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

ReportDialog.displayName = 'ReportDialog';
