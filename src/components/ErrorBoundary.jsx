import { Component } from "react";

// Keeps one crashing view from blanking the whole app
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("View crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { theme } = this.props;
    return (
      <div className="max-w-xl mx-auto mt-24 p-10 rounded-2xl border text-center" style={{ backgroundColor: theme.headerBg, borderColor: theme.border, color: theme.text }}>
        <h2 className="text-2xl font-heading mb-4" style={{ color: theme.accent }}>Something went wrong</h2>
        <p className="mb-8" style={{ color: theme.subtext }}>This view hit an unexpected error. Your data is safe.</p>
        <button
          onClick={() => this.setState({ hasError: false })}
          className="px-8 py-3 rounded-xl font-black text-xs tracking-widest uppercase"
          style={{ backgroundColor: theme.accentGlow, color: theme.buttonText }}
        >
          Try again
        </button>
      </div>
    );
  }
}
