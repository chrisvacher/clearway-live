import { FileDown } from "lucide-react";

// Step 5 puts the clean export here: the report as a document and the sources as an appendix. Until then it says so.
export function ExportPanel() {
  return <div className="rpt-soon" data-testid="rpt-export"><FileDown aria-hidden="true" width={18} height={18} /><span>Export. Coming in this milestone: the signed report as a clean document, with the sources kept out of it.</span></div>;
}
