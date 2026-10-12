"use client";

import { useState } from "react";
import Image from "next/image";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { features, photos } from "@/content/home";
import { ProductCard } from "./product-card";
import { Caption, SectionHeading, container } from "./primitives";
import { cn } from "@/lib/cn";

export function Features() {
  const [open, setOpen] = useState("0");
  // Closing every group returns the visual to the planning overview.
  const shown = open === "" ? 0 : Number(open);

  return (
    <section id="features" className="bg-[#f3f1eb] py-[110px] max-lg:py-20 max-md:py-16">
      <div className={container}>
        <SectionHeading
          className="mb-[50px]"
          eyebrow="THE TOOLS BEHIND THE WORK"
          title="A little more clarity."
          muted="Across the whole day."
          intro="Office coordination and field records, brought into focus."
        />
        <div className="grid items-center gap-12 lg:grid-cols-[5fr_7fr]">
          <Accordion.Root type="single" collapsible value={open} onValueChange={setOpen}>
            {features.map((feature, n) => (
              <Accordion.Item key={feature.label} value={String(n)} className="border-b border-[#dde1e2] py-2">
                <Accordion.Header asChild>
                  <h3>
                    <Accordion.Trigger className="group flex w-full items-center gap-[19px] py-6 text-left text-base font-bold tracking-[-0.015em] text-maple-ink data-[state=open]:text-maple-teal max-md:gap-3 max-md:text-[0.9rem]">
                      <span className="text-[0.65rem] font-medium text-[#58695f]">
                        {String(n + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1">{feature.label}</span>
                      <ChevronDown
                        aria-hidden
                        className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                      />
                    </Accordion.Trigger>
                  </h3>
                </Accordion.Header>
                <Accordion.Content className="pr-4 pb-6 pl-[34px] max-md:p-0 max-md:pb-[22px]">
                  <h4 className="text-[1.05rem] leading-normal font-bold tracking-[-0.03em] text-maple-ink">
                    {feature.title}
                  </h4>
                  <p className="mt-2 text-[0.88rem] leading-[1.85] text-maple-muted">{feature.body}</p>
                  <figure className="mt-7 hidden max-lg:block max-md:mt-[22px]">
                    <ProductCard scene={feature.scene} className="max-w-[400px]" />
                    <Caption>Illustrative product concept</Caption>
                  </figure>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>

          <div className="grid min-h-[550px] rounded-3xl bg-[#e5ebe8] p-[30px] max-xl:p-[22px] max-lg:hidden">
            {features.map((feature, n) => (
              <figure
                key={feature.label}
                aria-hidden={shown !== n}
                className={cn(
                  "relative col-start-1 row-start-1 min-h-[490px] pt-[72px] transition-[opacity,transform,visibility] duration-300",
                  shown === n ? "visible opacity-100" : "invisible translate-y-2.5 opacity-0",
                )}
              >
                <Image
                  src={photos[feature.photo].src}
                  alt={photos[feature.photo].alt}
                  width={1536}
                  height={1024}
                  sizes="200px"
                  className="absolute top-0 right-0 h-[180px] w-[200px] rounded-[14px] object-cover object-[center_30%]"
                />
                <ProductCard scene={feature.scene} className="relative z-[1] w-4/5 max-w-[340px] max-xl:w-[90%]" />
                <Caption className="mt-5 text-[0.61rem]">Illustrative product concept · Fictional data</Caption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
