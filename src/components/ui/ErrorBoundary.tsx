import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icons';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error de interfaz:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="entry-loading">
          <span className="entry-loading__icon">
            <Icon name="compass" size={34} />
          </span>
          <h1>Perdimos el rumbo por un momento.</h1>
          <p>Recargá la página para volver al mapa.</p>
          <Button onClick={() => window.location.reload()}>Recargar Tierras</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
