import type { TextMessagePartComponent } from '@assistant-ui/react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';

const plugins = { code, math };

export const StreamdownText: TextMessagePartComponent = ({ text, status }) => (
  <Streamdown
    plugins={plugins}
    mode={status?.type === 'running' ? 'streaming' : undefined}
    animated={status?.type === 'running'}
  >
    {text}
  </Streamdown>
);

StreamdownText.displayName = 'StreamdownText';
