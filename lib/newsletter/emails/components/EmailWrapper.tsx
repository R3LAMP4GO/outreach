import { type ReactNode } from "react";
import { Html, Head, Body, Container, Font } from "@react-email/components";

interface EmailWrapperProps {
  children: ReactNode;
}

export function EmailWrapper({ children }: EmailWrapperProps) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Arial", "sans-serif"]}
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap",
            format: "woff2",
          }}
        />
      </Head>
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: "#f9fafb",
    margin: "0",
    padding: "20px 0",
  },
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
  },
};

export default EmailWrapper;
