import { redirect } from "next/navigation";

/**
 * /channels default landing.
 * Per IA v6 we drop the user straight into the LLM model pool (most
 * actionable surface for a brand-new admin onboarding into Channels).
 */
export default function ChannelsIndexPage() {
  redirect("/channels/llm");
}