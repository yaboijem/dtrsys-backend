import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import { useUnread } from '../notifications/UnreadContext';
import { ConsentScreen } from '../screens/ConsentScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MfaScreen } from '../screens/MfaScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';

export type AuthStackParamList = {
  Login: undefined;
  Mfa: undefined;
};

export type AppTabParamList = {
  Home: undefined;
  History: undefined;
  Notifications: undefined;
  More: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppTabs = createBottomTabNavigator<AppTabParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Mfa" component={MfaScreen} />
    </AuthStack.Navigator>
  );
}

function TabBarIcon({ name, color, size }: { name: keyof typeof Ionicons.glyphMap; color: string; size: number }) {
  return <Ionicons name={name} color={color} size={size} />;
}

function AppNavigator() {
  const { unreadCount } = useUnread();

  return (
    <AppTabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
      }}
    >
      <AppTabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="home-outline" color={color} size={size} />,
        }}
      />
      <AppTabs.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="time-outline" color={color} size={size} />,
        }}
      />
      <AppTabs.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => <TabBarIcon name="notifications-outline" color={color} size={size} />,
        }}
      />
      <AppTabs.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <TabBarIcon name="menu-outline" color={color} size={size} />,
        }}
      />
    </AppTabs.Navigator>
  );
}

export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'restoring') {
    return <LoadingScreen />;
  }

  return status === 'authed' ? <AppNavigator /> : <AuthNavigator />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
