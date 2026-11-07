import { Console } from "@/components/console/Console";
import { PERSONAS } from "@/data/personas";
import { SCENARIOS } from "@/data/scenarios";

export default function Home() {
  return <Console personas={PERSONAS} scenarios={SCENARIOS} />;
}
