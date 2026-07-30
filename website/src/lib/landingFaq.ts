import type { MessageKey } from "./i18n/messages";

interface LandingFaqItem {
  questionKey: MessageKey;
  answerKey: MessageKey;
}

export const LANDING_FAQ_ITEMS: readonly LandingFaqItem[] = [
  {
    questionKey: "faq.what.question",
    answerKey: "faq.what.answer",
  },
  {
    questionKey: "faq.agents.question",
    answerKey: "faq.agents.answer",
  },
  {
    questionKey: "faq.free.question",
    answerKey: "faq.free.answer",
  },
  {
    questionKey: "faq.mcp.question",
    answerKey: "faq.mcp.answer",
  },
  {
    questionKey: "faq.subscriptions.question",
    answerKey: "faq.subscriptions.answer",
  },
  {
    questionKey: "faq.platforms.question",
    answerKey: "faq.platforms.answer",
  },
  {
    questionKey: "faq.difference.question",
    answerKey: "faq.difference.answer",
  },
];
