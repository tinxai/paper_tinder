/** Auth form: inline validation, submission, and server-error surfacing. */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AuthForm } from '@/components/AuthForm';
import { ApiError } from '@/services/errors';
import { renderWithProviders } from './testUtils';

async function fillAndSubmit(email: string, password: string) {
  await fireEvent.changeText(screen.getByTestId('email-input'), email);
  await fireEvent.changeText(screen.getByTestId('password-input'), password);
  await fireEvent.press(screen.getByTestId('submit-button'));
}

describe('AuthForm', () => {
  it('renders both fields and the submit button', async () => {
    await renderWithProviders(
      <AuthForm mode="sign-up" submitLabel="Create account" onSubmit={jest.fn()} />,
    );

    expect(screen.getByTestId('email-input')).toBeTruthy();
    expect(screen.getByTestId('password-input')).toBeTruthy();
    expect(screen.getByText('Create account')).toBeTruthy();
  });

  it('blocks submission and shows an error for an invalid email', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(
      <AuthForm mode="sign-up" submitLabel="Create account" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('not-an-email', 'sup3rsecret!');

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission for a short password', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(
      <AuthForm mode="sign-up" submitLabel="Create account" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('researcher@example.com', 'short');

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid credentials', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(
      <AuthForm mode="sign-up" submitLabel="Create account" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('researcher@example.com', 'sup3rsecret!');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('researcher@example.com', 'sup3rsecret!');
    });
  });

  it('shows a server error against the email field for a duplicate account', async () => {
    const onSubmit = jest.fn().mockRejectedValue(
      new ApiError('An account with that email already exists.', {
        status: 409,
        code: 'conflict',
      }),
    );
    await renderWithProviders(
      <AuthForm mode="sign-up" submitLabel="Create account" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('taken@example.com', 'sup3rsecret!');

    await waitFor(() => {
      expect(screen.getByText('An account with that email already exists.')).toBeTruthy();
    });
  });

  it('shows a banner for an error with no specific field', async () => {
    const onSubmit = jest.fn().mockRejectedValue(
      new ApiError('Incorrect email or password.', {
        status: 401,
        code: 'unauthorized',
      }),
    );
    await renderWithProviders(
      <AuthForm mode="sign-in" submitLabel="Sign in" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('someone@example.com', 'wrongpassword');

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeTruthy();
      expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
    });
  });

  it('surfaces a network failure readably', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new ApiError('Could not reach the server.', { status: 0 }));
    await renderWithProviders(
      <AuthForm mode="sign-in" submitLabel="Sign in" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('someone@example.com', 'sup3rsecret!');

    await waitFor(() => {
      expect(screen.getByText('Could not reach the server.')).toBeTruthy();
    });
  });

  it('allows a short password on sign-in', async () => {
    // An existing account may predate the 8-character rule; let the server decide.
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(
      <AuthForm mode="sign-in" submitLabel="Sign in" onSubmit={onSubmit} />,
    );

    await fillAndSubmit('someone@example.com', 'old');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('someone@example.com', 'old');
    });
  });
});
