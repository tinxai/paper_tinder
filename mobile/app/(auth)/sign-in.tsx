import { useRouter } from 'expo-router';
import { AuthForm } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const router = useRouter();

  return (
    <Screen edges={['bottom']} testID="sign-in-screen">
      <AuthForm
        mode="sign-in"
        submitLabel="Sign in"
        onSubmit={signIn}
        footer={
          <Button
            label="Create an account instead"
            variant="ghost"
            onPress={() => router.replace('/(auth)/sign-up')}
          />
        }
      />
    </Screen>
  );
}
