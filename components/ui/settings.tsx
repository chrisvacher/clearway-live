import { cloneElement, isValidElement, useId, type ReactNode } from "react";

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
  const generatedId = useId();
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children) ? children : null;
  const id = control?.props.id ?? generatedId;
  const helpId = help ? `${id}-help` : undefined;
  const describedBy = [control?.props["aria-describedby"], helpId].filter(Boolean).join(" ") || undefined;
  return <div className={`cwl-ui-field${wide ? " is-wide" : ""}`} data-dirty={dirty || undefined}>
    <label htmlFor={id}>{label}</label>
    {control ? cloneElement(control, { id, "aria-describedby": describedBy }) : <div>{children}</div>}
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
