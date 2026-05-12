"use client";

import { Component, type ReactNode } from "react";
import { Card, CardContent } from "@/components/shadcn/ui/card";
import { IconAlertTriangle } from "@tabler/icons-react";

interface Props {
  children: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <IconAlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              {this.props.sectionName ?? "Section"} unavailable — try refreshing
            </span>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
