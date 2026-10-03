import { baseUrl } from "@/lib/config";
import { renderEmail, sendEmail } from "@/lib/mailer";
import { issueAuthToken } from "@/lib/tokens";

// Kept out of the "use server" action files on purpose: anything exported from those becomes a
// public endpoint, and this must only ever run for the account the server has already identified.
export async function sendVerificationEmail(userId: string, email: string, name: string) {
  const token = await issueAuthToken(userId, "VERIFY_EMAIL");
  return sendEmail({
    to: email,
    kind: "verify-email",
    subject: "Confirm your email for Nigeria's Beautiful Minds",
    html: renderEmail({
      heading: `Welcome, ${name}`,
      paragraphs: ["Please confirm this email address to post, comment, host conversations and apply for mentorship. The link works for 48 hours."],
      action: { label: "Confirm my email", url: `${baseUrl()}/verify-email?token=${token}` },
      footnote: "If you didn't create an NBM account, you can ignore this email."
    })
  });
}
