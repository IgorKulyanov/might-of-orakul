import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Ловит падения UI — игра не «белый экран», можно перезагрузить. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[orakul] UI crash:", error, info.componentStack);
  }

  private reload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  private softReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "linear-gradient(160deg,#1a1510,#0d0b09)",
          color: "#f0e6d8",
          fontFamily: "Georgia, serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>
            Что-то сломалось
          </h1>
          <p style={{ opacity: 0.75, fontSize: "0.95rem", marginBottom: 20 }}>
            Игра поймала ошибку и не упала совсем. Можно продолжить или
            перезагрузить.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button type="button" onClick={this.softReset}>
              Попробовать снова
            </button>
            <button type="button" onClick={this.reload}>
              Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
