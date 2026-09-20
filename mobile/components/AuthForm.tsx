/**
 * Shared email/password form for sign-in and sign-up.
 *
 * React Hook Form + Zod handles field validation locally; server-side errors
 * (a duplicate email, bad credentials) come back from the API and are shown
 * against the right field when the backend names one.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/errors';
import { signInSchema, signUpSchema, type SignUpValues } from '@/services/validation';
import { Button } from './Button';
import { TextField } from './TextField';

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up';
  onSubmit: (email: string, password: string) => Promise<void>;
  submitLabel: string;
  footer?: React.ReactNode;
}

export function AuthForm({ mode, onSubmit, submitLabel, footer }: AuthFormProps) {
  const { colors } = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(mode === 'sign-up' ? signUpSchema : signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (error) {
      if (error instanceof ApiError) {
        // Attach field-level messages where the backend gave us one.
        const fieldEntries = Object.entries(error.fieldErrors);
        let attached = false;
        for (const [field, message] of fieldEntries) {
          if (field === 'email' || field === 'password') {
            setError(field, { message });
            attached = true;
          }
        }
        // Duplicate email has no field in the response, but belongs on the field.
        if (error.code === 'conflict') {
          setError('email', { message: error.message });
          attached = true;
        }
        if (!attached) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fields}>
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                testID="email-input"
                label="Email"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="you@university.edu"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                error={errors.email?.message}
                editable={!submitting}
                returnKeyType="next"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                testID="password-input"
                label="Password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={
                  mode === 'sign-up' ? 'At least 8 characters' : 'Your password'
                }
                secureTextEntry
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
                error={errors.password?.message}
                editable={!submitting}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
            )}
          />

          {formError ? (
            <View style={[styles.banner, { backgroundColor: colors.dangerSubtle }]}>
              <Text
                testID="form-error"
                accessibilityRole="alert"
                style={[styles.bannerText, { color: colors.danger }]}
              >
                {formError}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            testID="submit-button"
            label={submitLabel}
            size="large"
            onPress={() => void submit()}
            loading={submitting}
          />
          {footer}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingVertical: spacing.xl },
  fields: { gap: spacing.lg },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  banner: { padding: spacing.md, borderRadius: 10 },
  bannerText: { ...typography.subtle },
});
