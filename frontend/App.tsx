// ---------------------------------------------------------------------------
// DIRECTION CONTRACT — "ID Badge"
//
// Chosen visual world for this app (concept-seed key 25dec052, assigned
// candidate 3 of the grounded list; approved pool 94ff10ff20de).
//
// The phone behaves like the employee's physical ID badge, and punching a
// time record is like stamping the badge at a gate:
//   - Laminate surfaces: off-white ground, white cards with hairline edges.
//   - Navy identity band: app mark + the employee's badge strip on Home.
//   - Monospace-style ID digits for employee ID / times (tabular, letter-spaced).
//   - Gate lamp as clock state: green (open, ready to punch), red (clocked
//     in), amber (offline — punches queue locally and sync later).
//   - Punch = the slot: one large thumb-zone action at the top of Home.
//   - Confirmation = a physical stamp: rotated, uppercase, spring-settled.
//     This is the app's single authored motion.
//   - Dark mode = the badge under the gate light: near-black ground, dark
//     laminate cards, lighter band.
//
// Challengers considered and set aside: transit diagram (legibility loss),
// phosphor terminal (identity loss), streetwear labels (trust), one-bit
// desktop and Designers Republic noise (tool monoculture), tensegrity (no
// product path), literal paper time card (spent as the one literal reading).
//
// Backend contract and product principles: see PRODUCT.md. Token system:
// frontend/src/theme.ts (light + dark). Design system: DESIGN.md.
// ---------------------------------------------------------------------------

import { DarkTheme, DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { UnreadProvider } from './src/notifications/UnreadContext';
import { darkColors, lightColors } from './src/theme';

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const navTheme = useMemo<Theme>(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        primary: colors.band,
        background: colors.ground,
        card: colors.card,
        text: colors.ink,
        border: colors.border,
        notification: colors.danger,
      },
    }),
    [isDark, colors],
  );

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style={isDark ? 'light' : 'dark'} />
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
