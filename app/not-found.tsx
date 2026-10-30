import Link from "next/link";
import { Surface } from "@/components/layout/surface";

export default function NotFound() {
  return <Surface surface="phone" theme="dark"><main id="main" className="page-width narrow">
    <h1>We couldn’t find that page.</h1>
    <p>Check the room link with your facilitator.</p>
    <Link className="text-link" href="/">Return to the start</Link>
  </main></Surface>;
}
