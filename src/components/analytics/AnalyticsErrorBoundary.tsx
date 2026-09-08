import React, { ErrorInfo, ReactNode } from 'react';
import { RotateCw, ArrowLeft, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  onBack?: () => void;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AnalyticsErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AnalyticsErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-lg mx-auto my-12 p-6 sm:p-8 rounded-3xl bg-surface border border-border shadow-premium text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto shadow-soft">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-text-primary">
              {this.props.title || 'Analytics temporarily unavailable'}
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
              We encountered an issue preparing the analytics dashboard. Your data is safe. Please retry or return to your profile.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              id="btn-analytics-error-retry"
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-soft transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry Analytics</span>
            </button>

            {this.props.onBack && (
              <button
                type="button"
                id="btn-analytics-error-back"
                onClick={this.props.onBack}
                className="px-5 py-2.5 rounded-full bg-surface-elevated hover:bg-surface border border-border text-text-primary text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Go Back</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
