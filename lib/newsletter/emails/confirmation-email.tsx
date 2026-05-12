import { EmailWrapper } from "./components/EmailWrapper";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { Heading, Text, Button, Section } from "@react-email/components";

export interface ConfirmationEmailProps {
  verificationUrl: string;
  email: string;
}

export function ConfirmationEmail({ verificationUrl, email }: ConfirmationEmailProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://__YOUR_DOMAIN__";
  const unsubscribeUrl = `${siteUrl}/newsletter/unsubscribe?email=${email}`;
  // Absolute URL is required because emails render outside the app domain.
  const logoUrl = `${siteUrl}/logos/logo.png`;

  return (
    <EmailWrapper>
      <EmailHeader logoUrl={logoUrl} logoWidth={120} logoHeight={120} />

      <Heading style={styles.heading}>Welcome to __YOUR_BRAND__</Heading>

      <Text style={styles.text}>
        Here&apos;s what to expect from me. Once a month, you&apos;ll get a recap of what we&apos;ve
        been building, the businesses we&apos;ve been helping, and practical insights on using AI to
        run a better operation.
      </Text>

      <Text style={styles.text}>
        If I send you something outside of that, it&apos;s because it&apos;s genuinely worth your
        time. No filler, no product updates you don&apos;t care about, no emails for the sake of
        emails. If something lands in your inbox from me, it&apos;s worth reading. Simple as that.
      </Text>

      <Section style={styles.buttonContainer}>
        <Button href={verificationUrl} style={styles.button}>
          Confirm Subscription
        </Button>
      </Section>

      <Text style={styles.disclaimer}>
        This link expires in 24 hours. If you didn&apos;t sign up for this newsletter, you can
        safely ignore this email.
      </Text>

      <EmailFooter unsubscribeUrl={unsubscribeUrl} />
    </EmailWrapper>
  );
}

const styles = {
  heading: {
    color: "#1a1a1a",
    fontSize: "24px",
    fontWeight: "300",
    margin: "0 0 24px 0",
    textAlign: "center" as const,
  },
  text: {
    color: "#666",
    fontSize: "16px",
    margin: "0 0 24px 0",
    textAlign: "center" as const,
  },
  buttonContainer: {
    textAlign: "center" as const,
    margin: "32px 0",
  },
  button: {
    display: "inline-block",
    backgroundColor: "#3B82F6",
    color: "#ffffff",
    textDecoration: "none",
    padding: "12px 32px",
    borderRadius: "12px",
    fontWeight: "500",
    fontSize: "16px",
  },
  disclaimer: {
    color: "#999",
    fontSize: "14px",
    margin: "24px 0 0 0",
    textAlign: "center" as const,
  },
};

export default ConfirmationEmail;
