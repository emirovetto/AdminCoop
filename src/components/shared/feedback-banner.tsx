type FeedbackBannerProps = {
  message?: string;
  tone?: "success" | "error";
};

export function FeedbackBanner({ message, tone = "success" }: FeedbackBannerProps) {
  if (!message) {
    return null;
  }

  return <div className={`feedback-banner feedback-banner--${tone}`}>{message}</div>;
}
