import { Component, type ReactNode } from "react";

/** Keeps the shell (mode badge, nav) alive if one screen throws; shows the error instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-testid="screen-error" className="m-4 rounded-lg border border-destructive/50 p-4 text-sm">
        <p className="font-medium">This screen could not be displayed.</p>
        <p className="text-muted-foreground">{this.state.error.message}</p>
      </div>
    );
  }
}
