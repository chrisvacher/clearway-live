import { Check } from "lucide-react";
import { brandFor, skins } from "@/lib/brand";

export function BrandField({ value, onChange, admin, disabled, id = "brand" }: {
  value: string;
  onChange: (value: string) => void;
  admin: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return <fieldset className="cwl-c-choice-group" disabled={!admin || disabled} aria-describedby={`${id}-help`}>
    <legend>Brand</legend>
    <div className="cwl-c-radio-pair">
      {skins.map(skin => <label className="cwl-c-radio-card" key={skin}>
        <input type="radio" name={id} value={skin} checked={value === skin} onChange={() => onChange(skin)} />
        {brandFor(skin).label}<Check size={16} aria-hidden="true" />
      </label>)}
    </div>
    <p className="cwl-ui-field-help" id={`${id}-help`}>Sets what the room sees and the room&apos;s address.{!admin && " Only an admin can change it."}</p>
  </fieldset>;
}
