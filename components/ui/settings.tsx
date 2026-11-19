import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useId } from "react";

export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="cwl-ui-settings-card">{children}</div>;
}

export function SettingsSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className="cwl-ui-settings-section" aria-labelledby={id}>
    <div className="cwl-ui-settings-heading">
      <h2 id={id}>{title}</h2>{description && <div>{description}</div>}
    </div>
    <div className="cwl-ui-settings-fields">{children}</div>
  </section>;
}

export function Field({ label, help, dirty, wide, children }: {
  label: string;
  help?: ReactNode;
  dirty?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  return <div className={`cwl-ui-field${wide ? " is-wide" : ""}`} data-dirty={dirty || undefined}>
    <label htmlFor={id}>{label}</label>
    {isValidElement(children)
      ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, { id, "aria-describedby": helpId })
      : <div>{children}</div>}
    {help && <div id={helpId} className="cwl-ui-field-help">{help}</div>}
  </div>;
}

export function DangerZone({ actions }: { actions: readonly { title: string; description: string; action: ReactNode }[] }) {
  return <div className="cwl-ui-danger-zone">
    <SettingsSection title="Danger zone" description="Kept apart from everyday settings. Each asks you to confirm.">
      {actions.map(({ title, description, action }) => <div className="cwl-ui-danger-row" key={title}>
        <div><strong>{title}</strong><p>{description}</p></div>{action}
      </div>)}
    </SettingsSection>
  </div>;
}
