import { ArrowRight, Check, CircleAlert, Quote, TreePine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  boundaries,
  deployments,
  direction,
  market,
  principles,
  solution,
  statement,
} from "@/content/who-we-are";
import { Eyebrow, Reveal, SectionHeading, container } from "../home/primitives";

const pad = (n: number) => String(n + 1).padStart(2, "0");

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-maple-line bg-white px-3.5 py-1.5 text-[0.78rem] font-semibold text-maple-text",
        className,
      )}
    >
      {children}
    </span>
  );
}

function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[1.15rem] leading-[1.3] font-bold tracking-[-0.03em] text-maple-ink", className)}>
      {children}
    </h3>
  );
}

/* ---------- Hero ---------- */

export function AboutHero() {
  return (
    <section className="px-5 max-lg:px-3">
      <div className="overflow-hidden rounded-[34px] bg-maple-shell pt-16 pb-16 max-lg:pt-12 max-md:rounded-[22px] max-md:pt-10 max-md:pb-10">
        <div className={cn(container, "grid items-center gap-12 lg:grid-cols-[7fr_5fr] max-lg:gap-10")}>
          <div className="motion-safe:animate-[rise_0.6s_both]">
            <Eyebrow className="mb-[22px]">WHO WE ARE</Eyebrow>
            <h1 className="text-[clamp(2.4rem,4.4vw,4.2rem)] leading-[1.08] font-semibold tracking-[-0.06em] text-maple-ink max-md:text-[clamp(2.1rem,8vw,2.8rem)]">
              One platform,
              <br />
              <span className="text-maple-teal">configured to each company&apos;s way of working.</span>
            </h1>
            {statement.mission.map((paragraph) => (
              <p key={paragraph} className="mt-6 max-w-[640px] text-[1.05rem] leading-[1.8] text-maple-muted max-md:text-[0.95rem]">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="rounded-[22px] bg-white p-8 shadow-[0_12px_40px_#243e2812] motion-safe:animate-[rise_0.65s_0.15s_both] max-md:p-6">
            <span className="mb-6 grid size-12 place-items-center rounded-xl bg-maple-sage text-maple-teal">
              <TreePine aria-hidden className="size-6" />
            </span>
            <Eyebrow className="mb-3">WHY &ldquo;BOREAL&rdquo;</Eyebrow>
            <p className="text-[0.95rem] leading-[1.8] text-maple-text">{statement.name}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {statement.nameQualities.map((quality) => (
                <Chip key={quality} className="border-transparent bg-maple-sage text-maple-teal-dark">
                  {quality}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Vision ---------- */

export function Vision() {
  return (
    <section className="bg-maple-ivory py-28 max-lg:py-20 max-md:py-16">
      <Reveal className={cn(container, "text-center")}>
        <Eyebrow>OUR VISION</Eyebrow>
        <Quote aria-hidden className="mx-auto mb-6 size-10 fill-maple-teal/15 text-maple-teal" />
        <blockquote className="mx-auto max-w-[1000px] text-[clamp(1.6rem,3vw,2.6rem)] leading-[1.3] font-semibold tracking-[-0.045em] text-maple-ink">
          {statement.vision.lead} {statement.vision.detail}
        </blockquote>
      </Reveal>
    </section>
  );
}

/* ---------- Market opportunity ---------- */

export function Market() {
  return (
    <section className="bg-[#f3f1eb] py-[110px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          eyebrow="THE MARKET OPPORTUNITY"
          title="An unsatisfactory choice."
          muted="Three imperfect options."
          intro={market.intro}
        />
        <div className="grid gap-6 md:grid-cols-3">
          {market.options.map((option) => (
            <Reveal key={option.title} className="rounded-[18px] bg-white p-7 max-md:p-6">
              <span className="mb-5 inline-block rounded-md bg-[#f2eee3] px-2.5 py-1 text-[0.68rem] font-bold tracking-[0.06em] text-[#7a5a2b] uppercase">
                {option.verdict}
              </span>
              <CardTitle>{option.title}</CardTitle>
              <p className="mt-3 text-[0.92rem] leading-[1.75] text-maple-muted">{option.body}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[5fr_7fr]">
          <Reveal className="rounded-[18px] bg-white p-8 max-md:p-6">
            <CardTitle>The consequences are tangible.</CardTitle>
            <ul className="mt-5 space-y-3">
              {market.consequences.map((item) => (
                <li key={item} className="flex gap-3 text-[0.92rem] leading-[1.6] text-maple-text">
                  <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-[#b26b1f]" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="rounded-[18px] bg-maple-ink p-8 text-white max-md:p-6">
            <Eyebrow className="mb-3 text-[#a9c4b8]">ONE SHARED SEQUENCE</Eyebrow>
            <h3 className="text-[1.4rem] leading-[1.25] font-semibold tracking-[-0.04em]">
              Request to invoice, in every industry.
            </h3>
            <ol className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-3">
              {market.sequence.map((step, n) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 pr-3.5 pl-1.5 text-[0.8rem] font-semibold">
                    <span className="grid size-6 place-items-center rounded-full bg-maple-teal text-[0.65rem]">
                      {pad(n)}
                    </span>
                    {step}
                  </span>
                  {n < market.sequence.length - 1 && <ArrowRight aria-hidden className="size-4 text-[#7fa596]" />}
                </li>
              ))}
            </ol>
            <p className="mt-7 text-[0.9rem] leading-[1.75] text-[#c8d6d0]">{market.sequenceNote}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- Solution ---------- */

export function Solution() {
  return (
    <section className="bg-maple-ivory py-[110px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          eyebrow="OUR SOLUTION"
          title="Composable modules."
          muted="On a common foundation."
          intro={solution.intro}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {solution.modules.map(({ icon: Icon, title, body }) => (
            <Reveal key={title} className="rounded-[18px] border border-maple-line bg-white p-6">
              <span className="mb-5 grid size-11 place-items-center rounded-xl bg-maple-sage text-maple-teal">
                <Icon aria-hidden className="size-5" />
              </span>
              <CardTitle className="text-[1rem]">{title}</CardTitle>
              <p className="mt-2 text-[0.85rem] leading-[1.7] text-maple-muted">{body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] bg-[#e9eee7] px-7 py-5 max-md:px-5">
          <span className="text-[0.66rem] font-extrabold tracking-[0.15em] text-[#58695f]">THE FOUNDATION</span>
          <div className="flex flex-wrap gap-2">
            {solution.foundation.map((item) => (
              <Chip key={item} className="border-transparent">
                {item}
              </Chip>
            ))}
          </div>
        </Reveal>

        <Reveal className="mt-16 grid items-center gap-10 rounded-[28px] bg-[#eae9df] p-12 lg:grid-cols-[5fr_7fr] max-lg:p-9 max-md:mt-12 max-md:p-6">
          <div>
            <Eyebrow className="mb-3">DEDICATED, BRANDED WORKSPACES</Eyebrow>
            <h3 className="text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1.15] font-semibold tracking-[-0.05em] text-maple-ink">
              Every client works in their own space.
            </h3>
            <p className="mt-4 text-[0.95rem] leading-[1.8] text-maple-muted">{solution.workspace}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {solution.workspaceIncludes.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-[0.9rem] font-semibold text-maple-ink">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-maple-sage text-maple-teal">
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Guiding principles ---------- */

export function Principles() {
  return (
    <section className="bg-white py-[110px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading center eyebrow="GUIDING PRINCIPLES" title="How we build." muted="Six commitments we keep." />
        <div className="grid md:grid-cols-2 lg:grid-cols-3">
          {principles.map(({ icon: Icon, title, body }, n) => (
            <Reveal key={title} className="border-t border-maple-line py-8 pr-8 max-md:py-6 max-md:pr-0">
              <div className="mb-5 flex items-center gap-3">
                <span className="text-[0.7rem] font-extrabold tracking-[0.15em] text-[#58695f]">{pad(n)}</span>
                <span className="h-px flex-1 bg-maple-line" />
                <Icon aria-hidden strokeWidth={1.6} className="size-[22px] text-maple-teal" />
              </div>
              <CardTitle>{title}</CardTitle>
              <p className="mt-3 text-[0.88rem] leading-[1.75] text-maple-muted">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Initial deployments ---------- */

export function Deployments() {
  return (
    <section className="bg-[#f3f1eb] py-[110px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          eyebrow="INITIAL DEPLOYMENTS"
          title="Two sectors."
          muted="One horizontal need."
          intro={deployments.intro}
        />
        <div className="grid gap-7 md:grid-cols-2 max-md:gap-6">
          {deployments.clients.map(({ icon: Icon, client, requirements, capability }, n) => (
            <Reveal
              as="article"
              key={client}
              className={cn("rounded-[22px] p-9 max-md:p-6", n === 0 ? "bg-maple-sand" : "bg-maple-mist")}
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-xl bg-white text-maple-teal">
                  <Icon aria-hidden className="size-6" />
                </span>
                <span className="text-[0.66rem] font-extrabold tracking-[0.15em] text-[#58695f]">CLIENT {pad(n)}</span>
              </div>
              <h3 className="text-[1.8rem] leading-[1.15] font-semibold tracking-[-0.045em] text-maple-ink max-md:text-[1.5rem]">
                {client}
              </h3>
              <p className="mt-6 mb-3 text-[0.66rem] font-extrabold tracking-[0.15em] text-[#58695f]">REQUIREMENTS</p>
              <div className="flex flex-wrap gap-2">
                {requirements.map((item) => (
                  <Chip key={item} className="border-transparent">
                    {item}
                  </Chip>
                ))}
              </div>
              <div className="mt-7 border-t border-black/10 pt-6">
                <p className="mb-2 text-[0.66rem] font-extrabold tracking-[0.15em] text-[#58695f]">CAPABILITY ESTABLISHED</p>
                <p className="text-[1rem] leading-[1.6] font-semibold text-maple-ink">{capability}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-7 grid items-center gap-8 rounded-[22px] bg-white p-9 lg:grid-cols-[6fr_6fr] max-md:p-6">
          <p className="text-[0.98rem] leading-[1.8] text-maple-text">{deployments.shared}</p>
          <ul className="space-y-3">
            {deployments.generalized.map(({ from, to }) => (
              <li
                key={from}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-maple-ivory px-4 py-3.5 text-[0.9rem]"
              >
                <span className="text-maple-muted">{from}</span>
                <ArrowRight aria-hidden className="size-4 text-maple-teal" />
                <strong className="font-bold text-maple-teal-dark">{to}</strong>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Long-term direction ---------- */

export function Direction() {
  return (
    <section className="bg-maple-ivory py-[110px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          eyebrow="LONG-TERM DIRECTION"
          title="Growing along"
          muted="the same sequence."
          intro={direction.intro}
        />
        <div className="grid gap-6 md:grid-cols-2">
          {direction.industries.map(({ group, items }) => (
            <Reveal key={group} className="rounded-[18px] border border-maple-line bg-white p-7 max-md:p-6">
              <p className="mb-1 text-[0.66rem] font-extrabold tracking-[0.15em] text-[#58695f]">PRIORITY CANDIDATES</p>
              <CardTitle className="mb-5">{group}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <Chip key={item} className="bg-maple-ivory">
                    {item}
                  </Chip>
                ))}
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-14 mb-6 text-[1.1rem] font-semibold tracking-[-0.02em] text-maple-ink max-md:mt-10">
          Two disciplines govern that expansion:
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {direction.disciplines.map(({ icon: Icon, title, body }) => (
            <Reveal key={title} className="flex gap-5 rounded-[18px] bg-[#f3f1eb] p-7 max-md:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-maple-teal">
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <CardTitle>{title}</CardTitle>
                <p className="mt-2 text-[0.9rem] leading-[1.75] text-maple-muted">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Boundaries & measures ---------- */

export function Measures() {
  return (
    <section className="mx-5 rounded-[28px] bg-maple-ink py-[90px] text-white max-md:mx-3 max-md:py-14">
      <div className={cn(container, "grid gap-14 lg:grid-cols-[5fr_7fr] max-lg:gap-12")}>
        <Reveal>
          <Eyebrow className="text-[#a9c4b8]">BOUNDARIES</Eyebrow>
          <h2 className="text-[clamp(2rem,3.4vw,3rem)] leading-[1.13] font-semibold tracking-[-0.055em]">
            What Boreal
            <br />
            <span className="text-[#8fb3a5]">will not do.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {boundaries.willNot.map((item) => (
              <li key={item} className="flex gap-3 text-[0.95rem] leading-[1.6] text-[#dbe5e0]">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10">
                  <X aria-hidden className="size-3.5" strokeWidth={2.5} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal>
          <Eyebrow className="text-[#a9c4b8]">MEASURES OF SUCCESS</Eyebrow>
          <h2 className="text-[clamp(2rem,3.4vw,3rem)] leading-[1.13] font-semibold tracking-[-0.055em]">
            Four indicators
            <br />
            <span className="text-[#8fb3a5]">we hold ourselves to.</span>
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {boundaries.measures.map(({ title, body }, n) => (
              <div key={title} className="rounded-[16px] border border-white/10 bg-white/[0.06] p-6">
                <span className="text-[0.7rem] font-extrabold tracking-[0.15em] text-[#8fb3a5]">{pad(n)}</span>
                <h3 className="mt-3 text-[1.05rem] font-bold tracking-[-0.02em]">{title}</h3>
                <p className="mt-2 text-[0.88rem] leading-[1.7] text-[#c8d6d0]">{body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
