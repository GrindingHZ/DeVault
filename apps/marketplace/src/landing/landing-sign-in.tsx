import { ApiError, login, loginRequestSchema, messageForError } from '@depawn/contracts';
import type { LoginRequest } from '@depawn/contracts';
import { Button, Dialog, Field } from '@depawn/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { currentAccountKeys } from '../current-account';
import { signIn } from './landing-copy';

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
    return 'Email or password is incorrect.';
  }
  return messageForError(error, 'The request failed. Try again.');
}

export interface SignInDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/* Signing in happens on the landing page rather than on a page of its own.

   The form was a screen with nothing else on it, reached by leaving the only
   thing that had explained the product. Now the argument stays behind the
   dialog: a reader who is not ready closes it and keeps reading, which they
   could not do when the form was a separate route. */
export function SignInDialog({ isOpen, onClose }: SignInDialogProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      /* Refetched, not invalidated. Invalidation only refetches a query
         something is currently observing, and the landing page behind this
         dialog is already holding the signed out answer. The destination
         would read that stale null and send the reader straight back. */
      await queryClient.refetchQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/portfolio' });
    },
  });

  return (
    <Dialog title={signIn.title} isOpen={isOpen} onClose={onClose}>
      <p className="mb-4 font-body text-sm text-ink-secondary">{signIn.lede}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          loginMutation.mutate(values);
        })}
      >
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          data-testid="email-input"
          errorMessage={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          data-testid="password-input"
          errorMessage={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <Button data-testid="login-submit" type="submit" disabled={loginMutation.isPending}>
          Sign in
        </Button>
        {loginMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageFor(loginMutation.error)}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
