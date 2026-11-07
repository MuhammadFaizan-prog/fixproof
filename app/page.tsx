import { AppHeader } from "@/components/shell/AppHeader";
import { Panel } from "@/components/shell/Panel";
import { ProofTrailEmpty } from "@/components/shell/ProofTrailEmpty";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <AppHeader mode="replay" sessionCredits={0} />
      <main className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Panel eyebrow="Ticket" title="Describe the problem">
            <label htmlFor="ticket" className="sr-only">
              Ticket text
            </label>
            <Textarea
              id="ticket"
              rows={7}
              maxLength={60000}
              placeholder="VPN keeps dropping since the update. Client demo at 3pm, I'm on my MacBook."
              className="min-h-40 resize-y rounded-[10px] bg-surface-sunken text-[15px] leading-[22px]"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Synthetic data only. Personal details are masked before any step reads them.</p>
              <Button disabled className="h-10 rounded-lg px-4">
                Run FixProof
              </Button>
            </div>
          </Panel>
          <Panel title="History">
            <p className="text-sm text-muted-foreground">Tickets you submit stay in this browser only.</p>
          </Panel>
        </div>
        <div className="lg:col-span-7">
          <ProofTrailEmpty />
        </div>
      </main>
    </>
  );
}
