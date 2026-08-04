import { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
}

export function Screen({ children, scroll = true, contentContainerStyle, style }: ScreenProps) {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'var(--ground)',
        ...(scroll ? {} : { height: '100vh', overflow: 'hidden' }),
        ...style,
      }}
    >
      <div
        className="mx-auto max-w-lg p-4 pb-8"
        style={{
          height: scroll ? undefined : '100%',
          overflowY: scroll ? undefined : 'auto',
          ...contentContainerStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
