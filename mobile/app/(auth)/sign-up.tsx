import { useRouter } from 'expo-router';
import { AuthForm } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const router = useRouter();

  return (
    <Screen edges={['bottom']} testID="sign-up-screen">
      <AuthForm
        mode="sign-up"
        submitLabel="Create account"
        onSubmit={signUp}
        footer={
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        }
      />
    </Screen>
  );
}
