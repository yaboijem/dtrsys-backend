import { ReactNode } from 'react';
import { useThemeColors } from '../theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
}

export function Screen({ children, scroll = true, contentContainerStyle, style }: ScreenProps) {
  const colors = useThemeColors();

  return (
    <div
      className="min-h-screen"
      style={{ background: colors.ground, ...style }}
    >
      <div
        className="mx-auto max-w-lg p-4 pb-8"
        style={contentContainerStyle}
      >
        {children}
      </div>
    </div>
  );
}
