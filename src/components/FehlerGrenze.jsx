import React from 'react';

// Fängt Fehler beim Aufbau einer Seite ab. Ohne diese Grenze wird der gesamte
// Baum abgeräumt und es bleibt ein weißer Bildschirm ohne jede Auskunft.
export default class FehlerGrenze extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fehler: null };
  }

  static getDerivedStateFromError(fehler) {
    return { fehler };
  }

  componentDidCatch(fehler, info) {
    console.error('Seitenfehler:', fehler, info?.componentStack);
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full border border-border rounded p-5">
          <p className="font-semibold">Diese Ansicht konnte nicht aufgebaut werden</p>
          <p className="mt-2 text-sm text-muted-foreground break-words">
            {this.state.fehler?.message || 'Unbekannter Fehler'}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => this.setState({ fehler: null })}
              className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm"
            >
              Nochmal versuchen
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-2 rounded border border-border text-sm"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}