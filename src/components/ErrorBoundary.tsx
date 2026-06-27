import { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text } from "react-native";
import { SPLASH_BG, SPLASH_SPINNER } from "../theme/constants";
import { UI_COPY } from "../i18n";

const C = UI_COPY.es;

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: SPLASH_BG }}>
        <Text style={{ color: SPLASH_SPINNER, fontSize: 20, fontWeight: "700" }}>{C.errorTitle}</Text>
        <Text style={{ color: "#fff", marginTop: 16, textAlign: "center" }}>
          {C.errorMessage}
        </Text>
      </View>
    );
  }
}
