import { redirect } from "next/navigation";
import { practiceId } from "@/lib/room/practice";
export const dynamic="force-dynamic";
export default function Practice(){redirect(`/room/${practiceId}`);}
