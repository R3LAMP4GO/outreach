import { EmailWrapper } from "./components/EmailWrapper";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { Story } from "./components/Story";
import { Heading, Text, Section, Hr } from "@react-email/components";

export interface NewsletterStory {
  headline: string;
  content: string;
  whyItMatters?: string;
  readMoreUrl?: string;
}

export interface CuratedBriefNewsletterProps {
  firstName?: string;
  stories: NewsletterStory[];
  date: string;
  email: string;
  issueNumber?: number;
}

export function CuratedBriefNewsletter({
  firstName,
  stories,
  date,
  email,
  issueNumber,
}: CuratedBriefNewsletterProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://__YOUR_DOMAIN__";
  const unsubscribeUrl = `${siteUrl}/newsletter/unsubscribe?email=${email}`;

  return (
    <EmailWrapper>
      <EmailHeader logoUrl="https://__YOUR_DOMAIN__/logo.png" />

      {/* Date and Issue */}
      <Text style={styles.dateIssue}>
        {date} {issueNumber && `• Issue #${issueNumber}`}
      </Text>

      {/* Personalized Greeting */}
      <Heading style={styles.greeting}>
        {firstName
          ? `Hi ${firstName}, here's what you need to know this week:`
          : "Here's what you need to know this week:"}
      </Heading>

      <Hr style={styles.divider} />

      {/* Stories */}
      {stories.map((story, index) => (
        <Story
          key={index}
          headline={story.headline}
          content={story.content}
          whyItMatters={story.whyItMatters}
          readMoreUrl={story.readMoreUrl}
        />
      ))}

      <Hr style={styles.divider} />

      {/* Closer */}
      <Section style={styles.closer}>
        <Text style={styles.closerText}>
          That&apos;s all for this week! Found this useful? Forward it to a colleague who&apos;d
          benefit.
        </Text>
        <Text style={styles.closerText}>
          Have a topic you&apos;d like us to cover? Just hit reply – we read every response.
        </Text>
      </Section>

      <EmailFooter unsubscribeUrl={unsubscribeUrl} />
    </EmailWrapper>
  );
}

const styles = {
  dateIssue: {
    color: "#999",
    fontSize: "12px",
    margin: "0 0 16px 0",
    textAlign: "center" as const,
  },
  greeting: {
    color: "#1a1a1a",
    fontSize: "20px",
    fontWeight: "400",
    margin: "0 0 24px 0",
  },
  divider: {
    border: "none",
    borderTop: "2px solid #e5e7eb",
    margin: "24px 0",
  },
  closer: {
    margin: "24px 0",
  },
  closerText: {
    color: "#666",
    fontSize: "14px",
    margin: "0 0 12px 0",
    lineHeight: "1.6",
  },
};

export default CuratedBriefNewsletter;
