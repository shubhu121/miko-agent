import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  
  region?: string;
  
  resetKeys?: unknown[];
}

interface State {
  error: Error | null;
  errorType: 'render' | 'network' | 'unknown';
  
  prevResetKeys: unknown[] | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorType: 'unknown', prevResetKeys: this.props.resetKeys };

  static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
    
    if (prevState.error && nextProps.resetKeys && prevState.prevResetKeys) {
      const changed = nextProps.resetKeys.length !== prevState.prevResetKeys.length
        || nextProps.resetKeys.some((k, i) => k !== prevState.prevResetKeys![i]);
      if (changed) {
        return { error: null, errorType: 'unknown', prevResetKeys: nextProps.resetKeys };
      }
    }
    
    if (nextProps.resetKeys !== prevState.prevResetKeys) {
      return { prevResetKeys: nextProps.resetKeys };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('abort') || msg.includes('timeout')) {
      return { error, errorType: 'network' };
    }
    return { error, errorType: 'render' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    window.__mikoLog?.('error', 'react', `${error.message}\n${info.componentStack}`);
  }

  handleRetry = () => {
    this.setState({ error: null, errorType: 'unknown' });
  };

  render() {
    if (this.state.error) {
      const { errorType } = this.state;
      const region = this.props.region;

      const title = errorType === 'network'
        ? 'Connection issue'
        : 'Something went wrong';

      const hint = errorType === 'network'
        ? 'Check your connection and try again.'
        : region
          ? `An error occurred in ${region}.`
          : 'An unexpected error occurred.';

      return (
        <div style={{
          padding: '24px',
          color: 'var(--text-secondary, #888)',
          fontSize: '13px',
          textAlign: 'center',
        }}>
          <p style={{ marginBottom: '4px', fontWeight: 500 }}>{title}</p>
          <p style={{ marginBottom: 'var(--space-12)', fontSize: '12px', opacity: 0.7 }}>{hint}</p>
          <button
            onClick={this.handleRetry}
            style={{
              background: 'none',
              border: '1px solid var(--border-light, #ddd)',
              borderRadius: '4px',
              padding: 'var(--space-4) var(--space-12)',
              cursor: 'default',
              color: 'inherit',
              fontSize: '12px',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
