"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError: (message: string) => void;
}

interface State {
  failed: boolean;
}

/**
 * Contains render-time failures of the 3D layer so the rest of the page
 * (HUD, section index, overlays) keeps working. The loading screen shows
 * the reported message as a fallback.
 */
export default class ExperienceErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[experience] render error", error, info.componentStack);
    this.props.onError(error.message || "The 3D scene stopped unexpectedly.");
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
