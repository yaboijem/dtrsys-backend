import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { UnreadProvider } from './src/notifications/UnreadContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="dark" />
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
