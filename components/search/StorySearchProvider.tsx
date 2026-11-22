"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createStorySearchController, type StorySearchConfig, type StorySearchController } from "@/lib/story-search";

const StorySearchContext = createContext<StorySearchController | null>(null);

export default function StorySearchProvider({ children, ...config }: StorySearchConfig & { children: ReactNode }) {
  const pathname = usePathname();
  return <SearchNavigation key={pathname} pathname={pathname} config={config}>{children}</SearchNavigation>;
}

function SearchNavigation({ pathname, config, children }: { pathname: string; config: StorySearchConfig; children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [pending, startTransition] = useTransition();
  const [controller] = useState(() => createStorySearchController({
    pathname, initialSearch: search, config,
    navigate: (href, method) => startTransition(() => { router[method](href, { scroll: false }); }),
  }));

  useEffect(() => { controller.acceptRoute(search, pending); }, [controller, search, pending]);
  useEffect(() => {
    const onPopState = () => controller.reset(window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => {
      controller.stopDebounce();
      window.removeEventListener("popstate", onPopState);
    };
  }, [controller]);

  return <StorySearchContext value={controller}>{children}</StorySearchContext>;
}

export function useStorySearchNavigation() {
  const controller = useContext(StorySearchContext);
  if (!controller) throw new Error("Story search controls require StorySearchProvider.");
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  return { ...state, controller, params: new URLSearchParams(state.search), query: controller.getQuery() };
}
