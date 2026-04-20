import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

function FullPageFallback({ error, onRetry }) {
  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui' }}>
      <h1 style={{ color: '#dc2626' }}>Something went wrong</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        The page failed to load. Please try refreshing.
      </p>
      <pre style={{
        background: '#f3f4f6',
        padding: '16px',
        borderRadius: '8px',
        overflow: 'auto',
        fontSize: '14px',
      }}>
        {error?.toString()}
      </pre>
      <button
        onClick={onRetry}
        style={{
          marginTop: '20px',
          padding: '10px 20px',
          background: '#3d59ab',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Refresh Page
      </button>
    </div>
  );
}

function InlineTabFallback({ error, onRetry, label }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <AlertTriangle className="text-red-500 mb-3" size={40} />
      <h2 className="text-lg font-semibold text-gray-800 mb-1">
        {label ? `${label} failed to load` : 'This section failed to load'}
      </h2>
      <p className="text-sm text-gray-500 mb-4 max-w-sm">
        An unexpected error occurred. The rest of the app is still working.
      </p>
      <pre className="bg-gray-100 text-left text-xs text-gray-600 rounded-lg p-3 max-w-lg w-full overflow-auto mb-4">
        {error?.toString()}
      </pre>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
      >
        <RefreshCw size={14} />
        Retry
      </button>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry() {
    if (this.props.inline) {
      this.setState({ hasError: false, error: null });
    } else {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <InlineTabFallback
            error={this.state.error}
            onRetry={this.handleRetry}
            label={this.props.label}
          />
        );
      }
      return (
        <FullPageFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}
