import { brandFor, skins } from "@/lib/brand";
import { Select } from "@/components/ui/select";

// The Brand choice, on Details and on Create: what the room sees and the room's address. Only an admin can change it; anyone else sees it fixed.
export function BrandField({ value, onChange, admin, id = "brand" }: { value: string; onChange: (value: string) => void; admin: boolean; id?: string }) {
  return <div className="cwl-field"><label htmlFor={id}>Brand</label>
    <Select id={id} value={value} disabled={!admin} aria-describedby={`${id}-help`} onChange={e => onChange(e.target.value)}>{skins.map(s => <option key={s} value={s}>{brandFor(s).label}</option>)}</Select>
    <p id={`${id}-help`} className="cwl-help">Sets what the room sees: the screens, phones, emails and summary, and the room’s address.{!admin && " Only an admin can change it."}</p></div>;
}
