"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { links, navItems } from "@/content/home";
import { Brand, buttonClass, container, textLinkClass } from "./primitives";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const actions = (
    <div className="flex items-center gap-[26px] max-xl:gap-[18px] max-lg:mt-[22px] max-md:flex-wrap">
      <a href={links.workerLogin} className={textLinkClass}>
        Worker Login
      </a>
      <a href={links.tenantLogin} className={buttonClass}>
        Tenant Login <ArrowUpRight aria-hidden className="ml-4 size-4" />
      </a>
    </div>
  );

  const nav = (
    <ul className="mx-auto flex list-none gap-[26px] p-0 max-xl:gap-[18px] max-lg:mx-0 max-lg:flex-col max-lg:gap-2.5">
      {navItems.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={item.href === pathname ? "page" : undefined}
            className="flex min-h-11 items-center px-2 py-2.5 text-[0.82rem] max-lg:px-0 font-bold text-maple-text no-underline hover:text-maple-teal aria-[current=page]:text-maple-teal max-lg:text-[0.95rem]"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <a
        href="#main"
        className="fixed top-3 left-3 z-[9999] -translate-y-[150%] bg-white p-3 text-maple-ink focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-[1000] bg-[rgba(255,254,250,0.97)] backdrop-blur-md">
        <Collapsible.Root open={open} onOpenChange={setOpen}>
          <nav aria-label="Primary" className={`${container} flex min-h-[84px] flex-wrap items-center max-lg:min-h-[76px]`}>
            <Brand />
            {/* Desktop: inline navigation */}
            <div className="flex flex-1 items-center max-lg:hidden">
              {nav}
              {actions}
            </div>
            {/* Mobile: toggled menu */}
            <Collapsible.Trigger
              className="ml-auto hidden min-h-11 min-w-11 items-center justify-center p-2 text-maple-ink max-lg:flex"
              aria-label={open ? "Close navigation" : "Open navigation"}
            >
              {open ? <X aria-hidden className="size-7" /> : <Menu aria-hidden className="size-7" />}
            </Collapsible.Trigger>
            <Collapsible.Content className="w-full lg:hidden">
              <div className="pt-6 pb-7">
                {nav}
                {actions}
              </div>
            </Collapsible.Content>
          </nav>
        </Collapsible.Root>
      </header>
    </>
  );
}
