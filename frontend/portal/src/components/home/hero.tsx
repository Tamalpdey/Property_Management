import Image from "next/image";
import { ArrowDownRight, ArrowUpRight, Camera } from "lucide-react";
import { cn } from "@/lib/cn";
import { links, photos } from "@/content/home";
import { ProductCard } from "./product-card";
import { Eyebrow, buttonLargeClass, container, linkIconClass, textLinkClass } from "./primitives";

export function Hero() {
  return (
    <section className="px-5 max-lg:px-3">
      <div className="overflow-hidden rounded-[34px] bg-maple-shell pt-16 pb-6 max-lg:pt-12 max-md:rounded-[22px] max-md:pt-10 max-md:pb-[22px]">
        <div className={container}>
          <div className="mx-auto max-w-[1050px] text-center motion-safe:animate-[rise_0.6s_both]">
            <Eyebrow className="mb-[22px] max-md:text-[0.52rem] max-md:tracking-[0.09em]">
              LESS DISTANCE BETWEEN OFFICE &amp; FIELD
            </Eyebrow>
            <h1 className="m-0 text-[clamp(2.6rem,4.75vw,4.65rem)] leading-[1.08] font-semibold tracking-[-0.065em] text-maple-ink max-lg:text-[clamp(2.8rem,5.8vw,4rem)] max-md:text-[clamp(2.2rem,7vw,3.2rem)]">
              Property maintenance.
              <br />
              Connected from <span className="text-maple-teal">office to field.</span>
            </h1>
            <p className="mx-auto mt-[25px] max-w-[595px] text-base leading-[1.8] text-maple-muted max-md:text-[0.9rem]">
              Plan work, capture field records, review completion, and keep owner updates and invoices
              connected.
            </p>
            <div className="mt-[26px] flex flex-wrap items-center justify-center gap-7 max-md:gap-5">
              <a href="#features" className={buttonLargeClass}>
                Explore Maple <ArrowDownRight aria-hidden className="ml-4 size-4" />
              </a>
              <a href={links.tenantLogin} className={cn(textLinkClass, "max-md:text-[0.78rem]")}>
                Tenant Login <ArrowUpRight aria-hidden className={linkIconClass} />
              </a>
            </div>
          </div>

          <figure className="relative mx-auto mt-[54px] h-[455px] max-w-[1150px] max-lg:h-[470px] max-md:mt-[35px] max-md:grid max-md:h-auto">
            <div className="absolute top-0 right-[10%] left-[30%] h-[365px] overflow-hidden rounded-[22px] motion-safe:animate-[rise_0.65s_0.12s_both] max-xl:right-[8%] max-xl:left-1/4 max-lg:right-0 max-lg:left-[23%] max-lg:h-[330px] max-md:relative max-md:inset-auto max-md:aspect-[1.15] max-md:h-auto max-md:rounded-[15px]">
              <Image
                src={photos.field.src}
                alt={photos.field.alt}
                fill
                preload
                sizes="(max-width: 768px) 100vw, 700px"
                className="object-cover object-[center_32%] max-md:object-[64%_center]"
              />
              <span className="absolute bottom-[23px] left-6 rounded-[7px] bg-[#173b32c9] px-3.5 py-[9px] text-[0.8rem] text-white [text-shadow:0_1px_8px_#000] max-md:bottom-3.5 max-md:left-3 max-md:px-2.5 max-md:py-1.5 max-md:text-[0.62rem]">
                Out in the field. In the loop.
              </span>
            </div>

            <div className="absolute top-9 left-[1%] z-[2] w-[330px] -rotate-3 motion-safe:animate-[rise_0.65s_0.22s_both] max-xl:left-0 max-xl:w-[290px] max-lg:top-[65px] max-lg:w-[280px] max-md:relative max-md:inset-auto max-md:mx-auto max-md:-mt-3 max-md:w-[91%] max-md:rotate-0">
              <ProductCard scene={1} compact />
            </div>

            <div className="absolute top-[70px] right-0 h-60 w-[195px] rotate-4 overflow-hidden rounded-[100px_100px_18px_18px] border-[7px] border-maple-ivory motion-safe:animate-[rise_0.65s_0.32s_both] max-xl:h-[220px] max-xl:w-[165px] max-lg:hidden">
              <Image
                src={photos.office.src}
                alt={photos.office.alt}
                fill
                loading="eager"
                sizes="200px"
                className="object-cover object-[52%_center]"
              />
              <span className="absolute bottom-3.5 left-[15px] rounded-lg bg-[#183630b8] px-3 py-2 text-base leading-[1.2] font-semibold text-white [text-shadow:0_2px_10px_#000]">
                One team.
                <br />
                Connected.
              </span>
            </div>

            <div className="absolute right-[14%] bottom-[53px] flex items-center gap-3.5 rounded-[14px] bg-white px-[21px] py-[17px] shadow-[0_12px_40px_#243e2812] motion-safe:animate-[rise_0.65s_0.42s_both] max-xl:right-[10%] max-lg:right-0 max-lg:bottom-[50px] max-md:relative max-md:inset-auto max-md:mx-auto max-md:mt-3.5 max-md:w-full max-md:gap-2.5 max-md:p-3">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-maple-sage max-md:size-8">
                <Camera aria-hidden className="size-5 max-md:size-4" />
              </span>
              <div>
                <strong className="block text-[0.78rem] max-md:text-[0.66rem]">The detail stays with the job.</strong>
                <span className="mt-[3px] block text-[0.7rem] text-maple-muted max-md:text-[0.61rem]">
                  Photos, notes &amp; time records
                </span>
              </div>
              <span className="ml-[7px] size-[9px] rounded-full bg-[#497d46] max-md:hidden" />
            </div>

            <figcaption className="absolute bottom-0 w-full text-center text-[0.65rem] text-[#626c64] max-md:static max-md:mt-[18px] max-md:text-[0.55rem] max-md:leading-[1.7]">
              Illustrative product concept · Fictional data · AI-generated editorial photography
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
