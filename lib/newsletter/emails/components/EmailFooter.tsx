import { Section, Text, Link, Hr, Img } from "@react-email/components";

interface EmailFooterProps {
  unsubscribeUrl: string;
}

export function EmailFooter({ unsubscribeUrl }: EmailFooterProps) {
  const socialLinks = [
    {
      name: "LinkedIn",
      url: "https://www.linkedin.com/company/coastal-programs",
      icon: "https://cdn-icons-png.flaticon.com/512/174/174857.png",
    },
    {
      name: "X",
      url: "https://x.com/CoastalPrograms",
      icon: "https://cdn-icons-png.flaticon.com/512/5969/5969020.png",
    },
    {
      name: "GitHub",
      url: "https://github.com/Coastal-Programs",
      icon: "https://cdn-icons-png.flaticon.com/512/25/25231.png",
    },
    {
      name: "Website",
      url: "https://__YOUR_DOMAIN__",
      icon: "https://cdn-icons-png.flaticon.com/512/1006/1006771.png",
    },
  ];

  return (
    <>
      <Hr style={styles.divider} />
      <Section style={styles.footer}>
        {/* Social Icons */}
        <Section style={styles.socialIcons}>
          {socialLinks.map((social) => (
            <Link key={social.name} href={social.url} style={styles.socialLink}>
              <Img
                src={social.icon}
                alt={social.name}
                width="20"
                height="20"
                style={styles.socialIcon}
              />
            </Link>
          ))}
        </Section>

        {/* Company Name */}
        <Text style={styles.companyName}>__YOUR_BRAND__</Text>
        <Text style={styles.tagline}>Eliminate chaos. Scale with confidence.</Text>

        {/* Action Links */}
        <Text style={styles.actionLinks}>
          <Link href="mailto:hello@__YOUR_DOMAIN__" style={styles.footerLink}>
            Contact Us
          </Link>{" "}
          |{" "}
          <Link href="__YOUR_CAL_LINK__" style={styles.footerLink}>
            Book a Call
          </Link>
        </Text>

        {/* Unsubscribe */}
        <Text style={styles.unsubscribe}>
          No longer want to receive these emails?{" "}
          <Link href={unsubscribeUrl} style={styles.footerLink}>
            Unsubscribe
          </Link>
        </Text>
      </Section>
    </>
  );
}

const styles = {
  divider: {
    border: "none",
    borderTop: "1px solid #e5e7eb",
    margin: "32px 0",
  },
  footer: {
    textAlign: "center" as const,
  },
  socialIcons: {
    margin: "0 0 16px 0",
    textAlign: "center" as const,
  },
  socialLink: {
    display: "inline-block",
    width: "40px",
    height: "40px",
    margin: "0 4px",
    background: "#F3F4F6",
    border: "2px solid #ffffff",
    borderRadius: "8px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    textDecoration: "none",
    verticalAlign: "middle",
  },
  socialIcon: {
    width: "20px",
    height: "20px",
    margin: "10px",
    verticalAlign: "top",
  },
  companyName: {
    color: "#374151",
    fontSize: "14px",
    margin: "0 0 8px 0",
    fontWeight: "300",
  },
  tagline: {
    color: "#6B7280",
    fontSize: "12px",
    margin: "0 0 16px 0",
    fontWeight: "300",
    fontStyle: "italic",
  },
  actionLinks: {
    color: "#6B7280",
    fontSize: "12px",
    margin: "16px 0",
    fontWeight: "300",
  },
  footerLink: {
    color: "#3B82F6",
    textDecoration: "none",
  },
  unsubscribe: {
    color: "#6B7280",
    fontSize: "10px",
    margin: "0",
    fontWeight: "300",
  },
};

export default EmailFooter;
