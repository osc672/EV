import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#021B14' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="register" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="otp" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}
