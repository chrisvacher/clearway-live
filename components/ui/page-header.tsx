import type { ReactNode } from "react";
import { Menu, type MenuItem } from "./menu";

export function PageHeader({ kicker, title, lead, stage, facts, secondary, more, primary }: {
  kicker?: string;
  title: string;
  lead?: ReactNode;
  stage?: ReactNode;
  facts?: readonly { icon: ReactNode; text: ReactNode }[];
  secondary?: ReactNode;
  more?: readonly MenuItem[];
  primary?: ReactNode;
}) {
  return <header className="cwl-ui-page-header">
    <div className="cwl-ui-page-heading">
      {kicker && <div className="cwl-ui-page-kicker">{kicker}</div>}
      <div className="cwl-ui-page-title"><h1>{title}</h1>{stage}</div>
      {!!facts?.length && <ul className="cwl-ui-page-facts">
        {facts.map(({ icon, text }, index) => <li key={index}>{icon}{text}</li>)}
      </ul>}
      {lead && <div className="cwl-ui-page-lead">{lead}</div>}
    </div>
    {(secondary || !!more?.length || primary) && <div className="cwl-ui-page-actions">
      {secondary}
      {!!more?.length && <Menu items={more} />}
      {primary}
    </div>}
  </header>;
}
