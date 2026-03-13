"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    /* structured logging would go here */
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 p-8"
          style={{ color: "var(--color-text-muted)" }}
        >
          <div
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: "var(--color-error)" }}
          >
            {this.props.fallbackLabel ?? "Component"} Error
          </div>
          <div className="max-w-md text-center text-xs">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
            style={{
              backgroundColor: "var(--color-border)",
              color: "var(--color-text-secondary)",
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
