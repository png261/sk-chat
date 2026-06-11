import { createContext, useContext } from 'react';
import type { SkChatValue } from '../types';

export const SkChatContext = createContext<SkChatValue | null>(null);

export function useSkChat(): SkChatValue {
  const context = useContext(SkChatContext);

  if (!context) {
    throw new Error('useSkChat must be used inside SkChatProvider');
  }

  return context;
}
