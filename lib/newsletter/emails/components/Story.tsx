import { Heading, Text, Link, Section } from "@react-email/components";

interface StoryProps {
  headline: string;
  content: string;
  whyItMatters?: string;
  readMoreUrl?: string;
}

export function Story({ headline, content, whyItMatters, readMoreUrl }: StoryProps) {
  return (
    <Section style={styles.story}>
      <Heading style={styles.headline}>{headline}</Heading>
      <Text style={styles.content}>{content}</Text>

      {whyItMatters && (
        <Text style={styles.whyItMatters}>
          <strong>Why it matters:</strong> {whyItMatters}
        </Text>
      )}

      {readMoreUrl && (
        <Text style={styles.readMore}>
          <Link href={readMoreUrl} style={styles.link}>
            Read more →
          </Link>
        </Text>
      )}
    </Section>
  );
}

const styles = {
  story: {
    margin: "0 0 24px 0",
  },
  headline: {
    color: "#1a1a1a",
    fontSize: "18px",
    fontWeight: "600",
    margin: "0 0 12px 0",
  },
  content: {
    color: "#666",
    fontSize: "16px",
    margin: "0 0 12px 0",
    lineHeight: "1.6",
  },
  whyItMatters: {
    color: "#666",
    fontSize: "14px",
    margin: "0 0 12px 0",
    fontStyle: "italic",
  },
  readMore: {
    margin: "0",
  },
  link: {
    color: "#3B82F6",
    textDecoration: "none",
    fontWeight: "500",
  },
};

export default Story;
