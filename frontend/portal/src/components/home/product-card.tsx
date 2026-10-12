import Image from "next/image";
import {
  CalendarDays,
  Camera,
  Check,
  CircleCheck,
  Clipboard,
  ClipboardCheck,
  Leaf,
  MailOpen,
  MessageSquareText,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { photos, type SceneId } from "@/content/home";
import { cn } from "@/lib/cn";

/**
 * Illustrative product cards for the one-job story (fictional "Cedar House" data).
 * Each scene is plain HTML, not a screenshot, so it stays sharp and accessible.
 */

const headings: { title: string; icon: LucideIcon }[] = [
  { title: "Work order", icon: Clipboard },
  { title: "Today’s schedule", icon: CalendarDays },
  { title: "Field record", icon: Camera },
  { title: "Office review", icon: ClipboardCheck },
  { title: "Owner update", icon: MessageSquareText },
  { title: "Invoice draft", icon: Receipt },
];

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#edf0eb] py-[13px] text-[0.75rem]">
      <span className="text-maple-muted">{label}</span>
      <strong className="font-bold">{value}</strong>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[17px] rounded-lg bg-[#f4f5ef] px-[15px] py-[13px] text-[0.74rem] leading-[1.65] text-[#57665b]">
      {children}
    </div>
  );
}

function SceneBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-[15px] inline-flex items-center gap-1.5 rounded-md bg-[#eff5eb] px-2.5 py-[7px] text-[0.65rem] text-[#366845]">
      <Check aria-hidden className="size-3" strokeWidth={2.5} /> {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[0.57rem] tracking-[0.1em] text-maple-muted">{children}</span>
  );
}

function RecordPhoto({ kind }: { kind: "field" | "review" }) {
  return (
    <Image
      src={photos[kind].src}
      alt={photos[kind].alt}
      width={1536}
      height={1024}
      sizes="380px"
      className="h-40 w-full rounded-[9px] object-cover object-[center_32%]"
    />
  );
}

function CalendarRow({
  time,
  title,
  meta,
  quiet,
  className,
}: {
  time: string;
  title: string;
  meta: string;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-2.5 flex items-center gap-3.5", className)}>
      <time className="text-[0.59rem] text-maple-muted">{time}</time>
      <div
        className={cn(
          "flex-1 rounded-r-[7px] border-l-[3px] px-3 py-2.5",
          quiet ? "border-[#c6bfae] bg-[#f5f3ef]" : "border-[#5f8870] bg-[#eaf1e9]",
        )}
      >
        <strong className="block text-[0.69rem]">{title}</strong>
        <span className="mt-1 block text-[0.58rem] text-maple-muted">{meta}</span>
      </div>
    </div>
  );
}

function SceneBody({ scene, compact }: { scene: SceneId; compact?: boolean }) {
  switch (scene) {
    case 0:
      return (
        <>
          <div className="mb-[15px] rounded-[10px] bg-[#f4f5ef] p-[17px]">
            <Label>PROPERTY</Label>
            <strong className="mb-[3px] block text-[1.2rem]">Cedar House</strong>
            <span className="block">Garden inspection</span>
          </div>
          <Detail label="Service window" value="9:00–11:00 am" />
          <Detail label="Work type" value="Inspection" />
          <Note>Check planting beds and the front entrance.</Note>
        </>
      );
    case 1:
      return (
        <>
          <div className="mb-[19px] flex items-center gap-[13px]">
            <strong className="text-[2rem] leading-none">01</strong>
            <span className="text-[0.64rem] text-maple-muted">
              Thursday
              <br />
              October 2026
            </span>
          </div>
          <CalendarRow time="09:00" title="Garden inspection" meta="Cedar House · Alex Morgan" />
          <CalendarRow
            time="11:30"
            title="Equipment delivery"
            meta="Next service window"
            quiet
            className={compact ? "max-md:hidden" : undefined}
          />
          <SceneBadge>Worker assigned</SceneBadge>
        </>
      );
    case 2:
      return (
        <>
          <RecordPhoto kind="field" />
          <Detail label="Time recorded" value="1 h 45 min" />
          <Note>Entrance and planting beds checked. Photos attached to the job.</Note>
          <SceneBadge>Ready for office review</SceneBadge>
        </>
      );
    case 3:
      return (
        <>
          <RecordPhoto kind="review" />
          <ul className="mt-4 list-none p-0">
            {["Field notes reviewed", "Photos checked", "Completion reviewed"].map((item) => (
              <li key={item} className="flex gap-2.5 py-2 text-[0.76rem]">
                <CircleCheck aria-hidden className="size-4 text-maple-teal" />
                {item}
              </li>
            ))}
          </ul>
        </>
      );
    case 4:
      return (
        <>
          <div className="mt-1 mb-[25px] grid size-[62px] place-items-center rounded-full bg-[#e9f0e4] text-maple-teal">
            <MailOpen aria-hidden className="size-6" />
          </div>
          <Label>COMPLETION NOTICE</Label>
          <p className="m-0 text-[1.3rem] font-bold tracking-[-0.035em] text-maple-ink">
            Your property update.
          </p>
          <p className="mt-3 text-[0.8rem] leading-[1.7] text-maple-muted">
            The garden inspection at Cedar House has been reviewed and completed.
          </p>
          <Detail label="Delivery record" value="Notice sent" />
          <SceneBadge>Reviewed before sharing</SceneBadge>
        </>
      );
    case 5:
      return (
        <>
          <div className="mt-[15px] mb-[25px] flex items-center justify-between leading-[1.9]">
            <span>
              INV-1042
              <br />
              <strong>Cedar House</strong>
            </span>
            <span className="rounded bg-[#f2eee3] px-2.5 py-1 text-[0.64rem]">Draft</span>
          </div>
          <Detail label="Garden inspection" value="$180.00" />
          <Detail label="Materials" value="$40.00" />
          <div className="flex items-center justify-between pt-6 pb-[5px]">
            <span>Subtotal</span>
            <strong className="text-[1.7rem] tracking-[-0.05em] tabular-nums">$220.00</strong>
          </div>
          <Note>Work records and job costs, in one place.</Note>
        </>
      );
  }
}

export function ProductCard({
  scene,
  className,
  compact,
}: {
  scene: SceneId;
  className?: string;
  /** Tighter padding used by the hero's phone layout. */
  compact?: boolean;
}) {
  const { title, icon: Icon } = headings[scene];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[15px] border border-[#e0e6df] bg-white text-left text-[0.8rem] leading-normal text-maple-text shadow-card",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b border-[#e8ece6] text-[0.62rem] text-maple-muted",
          compact ? "px-[21px] py-[15px] max-md:px-[18px] max-md:py-3" : "px-[21px] py-[15px]",
        )}
      >
        <span className="flex items-center gap-1 text-[0.84rem] font-extrabold tracking-[-0.035em] text-maple-ink">
          <Leaf aria-hidden className="size-3.5 fill-maple-teal text-maple-teal" /> Maple
        </span>
        <span>WO-1042</span>
      </div>
      <div className={cn("scene-content", compact ? "p-[23px] max-md:p-[18px]" : "p-[23px]")}>
        <div
          className={cn(
            "scene-heading flex items-center justify-between gap-3",
            compact ? "mb-[22px] max-md:mb-[15px]" : "mb-[22px]",
          )}
        >
          <p className="m-0 text-[1.12rem] font-bold tracking-[-0.035em] text-maple-ink">{title}</p>
          <Icon aria-hidden className="size-4 text-maple-teal" />
        </div>
        <SceneBody scene={scene} compact={compact} />
      </div>
    </div>
  );
}
