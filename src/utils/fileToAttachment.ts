import type { SkChatAttachment } from '../types';

export function fileToAttachment(file: File): Promise<SkChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Cannot read file'));
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: typeof reader.result === 'string' ? reader.result : undefined,
      });
    };

    reader.readAsDataURL(file);
  });
}
