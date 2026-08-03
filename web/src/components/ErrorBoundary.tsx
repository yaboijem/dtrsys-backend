import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <div className="text-3xl font-bold text-danger">Something went wrong</div>
            <p className="mt-2 text-sm text-muted">
              An unexpected error occurred while rendering this page. Your session is unaffected. Try again, and if the problem
              persists, contact your administrator.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                this.setState({ error: null });
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
