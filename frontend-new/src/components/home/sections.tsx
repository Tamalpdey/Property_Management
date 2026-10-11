import Image from "next/image";
import Link from "next/link";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { links, photos, roles, workTypes, workspaceChoices } from "@/content/home";
import {
  Brand,
  Eyebrow,
  Reveal,
  SectionHeading,
  container,
  linkIconClass,
  textLinkClass,
} from "./primitives";

/** Internal routes use <Link>; the tenant app is an external destination. */
function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return href.startsWith("/") ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function Roles() {
  return (
    <section id="workspaces" className="bg-maple-ivory pt-[115px] pb-[75px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          center
          eyebrow="MADE FOR THE PEOPLE DOING THE WORK"
          title="Different workspaces."
          muted="One shared picture."
        />
        <div className="grid grid-cols-2 gap-7 max-md:grid-cols-1 max-md:gap-6">
          {roles.map((role) => {
            const TagIcon = role.tagIcon;
            return (
              <Reveal
                as="article"
                key={role.kind}
                className="overflow-hidden rounded-[22px] bg-maple-sand even:bg-maple-mist"
              >
                <div className="relative">
                  <Image
                    src={photos[role.kind].src}
                    alt={photos[role.kind].alt}
                    width={1536}
                    height={1024}
                    sizes="(max-width: 768px) 100vw, 600px"
                    className="aspect-[1.5] h-auto w-full object-cover"
                  />
                  <span className="absolute bottom-[18px] left-[18px] flex items-center rounded-lg bg-maple-ivory px-3.5 py-2.5 text-[0.68rem] shadow-[0_4px_20px_#1a3f2210] max-md:bottom-3 max-md:left-3 max-md:text-[0.61rem]">
                    <TagIcon aria-hidden className="mr-[7px] size-3.5 text-maple-teal" /> {role.tag}
                  </span>
                </div>
                <div className="px-[38px] pt-[33px] pb-[38px] max-lg:p-7">
                  <Eyebrow className="mb-3 text-[0.59rem]">{role.eyebrow}</Eyebrow>
                  <h3 className="mb-4 text-[2rem] leading-[1.15] font-semibold tracking-[-0.045em] text-maple-ink">
                    {role.title}
                  </h3>
                  <p className="mb-6 max-w-[400px] text-[0.92rem] leading-[1.8] text-maple-muted">{role.body}</p>
                  <SmartLink href={role.href} className={cn(textLinkClass, "text-[0.82rem]")}>
                    {role.linkLabel} <ArrowUpRight aria-hidden className={linkIconClass} />
                  </SmartLink>
                </div>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-[18px] text-center text-[0.72rem] text-[#69757b]">
          AI-generated editorial photography · Illustrative product concepts
        </p>
      </div>
    </section>
  );
}

export function WorkTypes() {
  return (
    <section className="bg-white pt-[65px] pb-[100px] max-md:py-16">
      <div className={container}>
        <SectionHeading center eyebrow="PROPERTY WORK" title="Built around the work you manage." />
        <div className="grid grid-cols-3 max-md:grid-cols-2">
          {workTypes.map(({ icon: Icon, title, body }) => (
            <Reveal
              key={title}
              className="relative border-t border-maple-line py-[26px] pr-[30px] pl-16 max-md:pt-[22px] max-md:pr-3 max-md:pb-6 max-md:pl-0"
            >
              <Icon
                aria-hidden
                strokeWidth={1.6}
                className="absolute top-[30px] left-1.5 size-[22px] text-maple-ink max-md:static max-md:mb-[15px] max-md:size-[26px]"
              />
              <h3 className="mb-[9px] text-base leading-[1.4] font-bold tracking-[-0.02em] text-maple-ink max-md:text-[0.85rem]">
                {title}
              </h3>
              <p className="m-0 max-w-[230px] text-[0.78rem] leading-[1.7] text-maple-muted max-md:text-[0.72rem]">
                {body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section className="mx-5 rounded-[28px] bg-[#eae9df] pt-[65px] pb-[70px] max-md:mx-3 max-md:py-[45px]">
      <div className={container}>
        <Reveal className="mb-[35px] text-center">
          <Eyebrow>YOUR NEXT STEP</Eyebrow>
          <h2 className="mt-[15px] mb-6 text-[clamp(2rem,3.5vw,3rem)] leading-[1.13] font-semibold tracking-[-0.055em] text-maple-ink">
            Find your Maple workspace.
          </h2>
          <p className="text-[1.1rem] text-maple-muted max-md:text-base">Choose the workspace for the work you do.</p>
        </Reveal>
        <Reveal className="flex flex-wrap justify-center gap-6">
          {workspaceChoices.map(({ icon: Icon, title, label, href }) => (
            <SmartLink
              key={title}
              href={href}
              className="flex w-full items-center gap-[22px] rounded-[13px] bg-white p-[23px] text-maple-ink no-underline transition hover:-translate-y-[3px] hover:bg-[#f8fbf4] active:scale-[0.985] md:w-[calc(50%-12px)] xl:w-[calc(41.666%-12px)] max-md:gap-3 max-md:p-[18px]"
            >
              <span className="grid size-[58px] shrink-0 place-items-center rounded-full bg-[#ecf0e8] max-md:size-10">
                <Icon aria-hidden className="size-6 max-md:size-5" />
              </span>
              <span className="flex-1">
                <strong className="block text-base tracking-[-0.025em] max-md:text-[0.8rem]">{title}</strong>
                <span className="mt-[5px] block text-[0.85rem] font-bold text-maple-teal underline underline-offset-4">
                  {label}
                </span>
              </span>
              <ArrowUpRight aria-hidden className="size-5 text-maple-teal" />
            </SmartLink>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const footerLinks = [
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#workflow" },
    { label: "Who we are", href: "/who-we-are" },
    { label: "Tenant Login", href: links.tenantLogin },
    { label: "Worker Login", href: links.workerLogin },
  ];
  return (
    <footer className="bg-maple-ivory pt-[55px] pb-20 max-md:pt-11 max-md:pb-[95px]">
      <div className={container}>
        <div className="flex items-center justify-between gap-[30px] max-lg:flex-wrap max-md:block">
          <Brand className="max-md:mb-7" />
          <nav aria-label="Footer" className="flex gap-6 max-xl:gap-4 max-lg:gap-6 max-md:grid max-md:grid-cols-2 max-md:gap-x-6 max-md:gap-y-[18px]">
            {footerLinks.map((link) => (
              <SmartLink
                key={link.label}
                href={link.href}
                className="text-[0.8rem] font-semibold text-maple-text no-underline hover:text-maple-teal max-md:min-h-8"
              >
                {link.label}
              </SmartLink>
            ))}
          </nav>
          <a href="#top" className="flex items-center gap-1.5 text-[0.8rem] font-semibold whitespace-nowrap text-maple-text no-underline max-lg:hidden">
            Back to top <ArrowUp aria-hidden className="size-3.5" />
          </a>
        </div>
        <div className="mt-[38px] flex justify-between gap-5 border-t border-[#dde1e2] pt-6 text-[0.68rem] text-maple-muted max-md:block max-md:text-[0.65rem] max-md:[&>span]:mt-2.5 max-md:[&>span]:block">
          <span>Maple · Property maintenance operations</span>
          <span>Product visuals are illustrative. Fictional data.</span>
        </div>
      </div>
    </footer>
  );
}
