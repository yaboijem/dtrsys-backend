import { ReactNode, type CSSProperties } from 'react';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: CSSProperties;
  style?: CSSProperties;
}

export function Screen({ children, scroll = true, contentContainerStyle, style }: ScreenProps) {
  return (
    <div
      className="portal-screen"
      style={{
        minHeight: scroll ? undefined : '100%',
        flex: scroll ? undefined : 1,
        display: scroll ? undefined : 'flex',
        flexDirection: scroll ? undefined : 'column',
        ...style,
      }}
    >
      <div
        className="portal-screen__inner"
        style={{
          flex: scroll ? undefined : 1,
          minHeight: 0,
          overflowY: scroll ? undefined : 'auto',
          ...contentContainerStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
