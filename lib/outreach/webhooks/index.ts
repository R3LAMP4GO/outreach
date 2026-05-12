/**
 * Webhooks module
 */

export * from "./types";
export * from "./resend-handler";

// Re-export individual event handlers for advanced usage
export { handleEmailSent } from "./events/sent";
export { handleEmailDelivered } from "./events/delivered";
export { handleEmailBounced } from "./events/bounced";
export { handleEmailOpened } from "./events/opened";
export { handleEmailClicked } from "./events/clicked";
export { handleEmailReceived } from "./events/received";
