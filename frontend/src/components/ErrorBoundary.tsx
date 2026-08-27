import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render errors in a subtree so a single page can never blank the app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Aish Aman] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card mx-auto my-10 max-w-md p-6 text-center">
          <p className="mb-2 text-lg font-bold text-ink">حدث خطأ في هذه الصفحة</p>
          <p className="mb-4 break-words text-sm text-ink-faint">{this.state.error.message}</p>
          <button
            className="btn-primary"
            onClick={() => this.setState({ error: null })}
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
