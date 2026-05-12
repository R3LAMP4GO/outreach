import { Img, Section } from "@react-email/components";

interface EmailHeaderProps {
  logoUrl: string;
  logoAlt?: string;
  logoWidth?: number;
  logoHeight?: number;
}

export function EmailHeader({
  logoUrl,
  logoAlt = "__YOUR_BRAND__",
  logoWidth = 180,
  logoHeight = 60,
}: EmailHeaderProps) {
  return (
    <Section style={styles.header}>
      <Img src={logoUrl} alt={logoAlt} width={logoWidth} height={logoHeight} style={styles.logo} />
    </Section>
  );
}

const styles = {
  header: {
    textAlign: "center" as const,
    marginBottom: "32px",
  },
  logo: {
    display: "block",
    margin: "0 auto",
    maxWidth: "100%",
    height: "auto",
  },
};

export default EmailHeader;
