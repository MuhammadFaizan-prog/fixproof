import { redirect } from "next/navigation";

/** /tour opens the guided judge tour on the console. */
export default function Tour() {
  redirect("/?tour=1");
}
