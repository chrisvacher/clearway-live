import { AiBadge } from "./ai-icon";
import { aiIconCredit, aiPageParagraphs, aiPagePath, aiPageTitle, aiSignInLine, aiSignInLink } from "@/lib/ai/disclosure";

// The AI line under the room's sign-in button, shown when the engagement has AI on.
// The last three words link to the "How we use AI" page.
export function AiSignInNote() {
  return <p className="ai-disclosure-note" data-ai-disclosure="sign-in">
    <AiBadge label="AI" />
    <span>{`${aiSignInLine} `}<a href={aiPagePath}>{aiSignInLink}</a></span>
  </p>;
}

// "How we use AI": the approved words, the icon credit as the last line.
export function AiDisclosurePage() {
  return <article className="ai-disclosure" data-ai-disclosure="page">
    <h1><AiBadge label="AI" /> {aiPageTitle}</h1>
    {aiPageParagraphs.map(text => <p key={text}>{text}</p>)}
    <p className="ai-disclosure-credit">{aiIconCredit}</p>
  </article>;
}
