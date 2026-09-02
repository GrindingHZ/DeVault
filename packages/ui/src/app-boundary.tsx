import { Component } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from './button';
import { EmptyState } from './empty-state';

/* Nothing in any of the three applications caught a render fault, so one bad
   render showed a white page and said nothing at all. */

interface AppBoundaryProps {
  readonly children: ReactNode;
  readonly onRecover?: () => void;
  /* Where a caught fault goes. There is no reporting service in this
     product yet, so the default hands it to the platform, which puts it in
     front of whoever has the console open rather than dropping it. */
  readonly onError?: (error: Error) => void;
}

interface AppBoundaryState {
  readonly hasFailed: boolean;
}

export class AppBoundary extends Component<AppBoundaryProps, AppBoundaryState> {
  constructor(props: AppBoundaryProps) {
    super(props);
    this.state = { hasFailed: false };
  }

  static getDerivedStateFromError(): AppBoundaryState {
    return { hasFailed: true };
  }

  /* Reported rather than swallowed. A fault somebody rang up about and
     nobody can find afterwards is barely better than the white page. */
  override componentDidCatch(error: Error): void {
    if (this.props.onError !== undefined) {
      this.props.onError(error);
      return;
    }
    if (typeof reportError === 'function') {
      reportError(error);
    }
  }

  private readonly recover = (): void => {
    this.setState({ hasFailed: false });
    this.props.onRecover?.();
  };

  override render(): ReactNode {
    if (!this.state.hasFailed) {
      return this.props.children;
    }
    return (
      <EmptyState
        title="This screen did not load"
        description="Something went wrong rendering it. Nothing you were doing has been lost."
        action={<Button onClick={this.recover}>Try again</Button>}
      />
    );
  }
}

export interface RouteNotFoundProps {
  readonly onHome?: () => void;
}

export function RouteNotFound({ onHome }: RouteNotFoundProps): ReactElement {
  return (
    <EmptyState
      title="There is nothing at this address"
      description="The link may be old, or the page may have moved."
      action={onHome === undefined ? undefined : <Button onClick={onHome}>Go back</Button>}
    />
  );
}

/* Reads the shape rather than importing ApiError, so packages/ui does not
   take a dependency on packages/contracts for one field.

   Only 401. A 403 is a thing this account may not do, which is not the same
   as a session that has expired, and signing somebody out for asking is a
   good way to lose them mid task. */
export function isUnauthenticated(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const status: unknown = (error as { statusCode?: unknown }).statusCode;
  return status === 401;
}
