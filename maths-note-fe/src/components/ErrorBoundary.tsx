import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Stack, Text, Button, Card, Center } from '@mantine/core';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  name: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ErrorBoundary caught an error in "${this.props.name}":`, error, errorInfo);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (err) {
        console.error("Failed to run onReset callback:", err);
      }
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Center className="w-full h-full p-4 bg-slate-50 dark:bg-black/20 min-h-[150px]">
          <Card
            shadow="md"
            radius="md"
            padding="lg"
            className="w-full max-w-sm border border-stone-200 dark:border-[#333] bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md"
          >
            <Stack align="center" gap="sm">
              <AlertCircle size={32} className="text-red-500 dark:text-red-400" />
              <Stack gap="xs" align="center" className="text-center">
                <Text fw={600} size="md" className="text-stone-900 dark:text-white">
                  Something went wrong
                </Text>
                <Text size="xs" c="dimmed">
                  An unexpected error occurred in the <strong>{this.props.name}</strong> section.
                </Text>
                {this.state.error && (
                  <Text size="xs" ff="monospace" className="p-2 rounded bg-slate-100 dark:bg-black/50 text-red-600 dark:text-red-400 w-full overflow-auto max-h-[80px] text-left">
                    {this.state.error.message}
                  </Text>
                )}
              </Stack>
              <Button
                variant="light"
                color="red"
                size="xs"
                leftSection={<RotateCcw size={14} />}
                onClick={this.handleReset}
                className="mt-1"
              >
                Try again
              </Button>
            </Stack>
          </Card>
        </Center>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
