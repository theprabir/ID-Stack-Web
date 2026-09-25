import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches rendering errors anywhere below it and shows a friendly,
 * theme-aware fallback instead of a blank screen.
 *
 * (Class component is required here — React does not support error
 * boundaries with hooks.)
 */
export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  public constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
    this.handleReload = this.handleReload.bind(this);
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private handleReload(): void {
    window.location.reload();
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-deepest p-8 text-center text-foreground"
          role="alert"
        >
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error occurred. You can try again or reload the application.
          </p>
          {import.meta.env.DEV && this.state.message && (
            <pre className="max-w-xl overflow-auto rounded-md bg-surface-card p-4 text-left text-xs text-muted-foreground">
              {this.state.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reload application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
