// A safety net under every page. When a component throws while drawing,
// React removes the WHOLE tree — the person sees a white screen and no
// reason. This catches the throw, keeps the navigation alive, and says so.
//
// (An error boundary has to be a class: React has no hook for it.)
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tx } from '../i18n';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() { return { failed: true }; }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // For whoever opens the console to report it.
        console.error('Page crashed:', error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div className="card empty">
                <h2>{tx("This page hit a problem")}</h2>
                <p>{tx("Nothing was lost — your data is safe. Reload the page to carry on.")}</p>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>{tx("Reload")}</button>
            </div>
        );
    }
}
