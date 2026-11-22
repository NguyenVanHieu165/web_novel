import { parseStoryQueryParams, storySearchMaxLength, type StoryQueryInput } from "@/schemas/story-query.schema";

export const storySearchKeys = ["q", "author", "theLoai", "trangThai", "sapXep", "soChuong", "vip", "page", "limit"] as const;
export type StorySearchKey = typeof storySearchKeys[number];
export type StorySearchChanges = Partial<Record<StorySearchKey, string | number | undefined>>;
export interface StorySearchConfig {
  defaults?: Partial<StoryQueryInput>;
  fixed?: Partial<StoryQueryInput>;
}

function readQuery(params: URLSearchParams, defaults?: Partial<StoryQueryInput>) {
  const raw: Record<string, unknown> = {};
  for (const key of storySearchKeys) {
    const values = params.getAll(key);
    if (values.length > 0) raw[key] = values.length === 1 ? values[0] : values;
  }
  return parseStoryQueryParams(raw, defaults);
}

export function storySearchParams(search: string, changes: StorySearchChanges = {}, {
  defaults = {}, fixed = {}, resetPage = true, clear = false,
}: StorySearchConfig & { resetPage?: boolean; clear?: boolean } = {}) {
  const params = new URLSearchParams(search);
  if (clear) storySearchKeys.forEach((key) => params.delete(key));
  for (const key of storySearchKeys) {
    if (!(key in changes)) continue;
    const value = changes[key];
    if (value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  if (resetPage) params.delete("page");

  const fallback = parseStoryQueryParams({}, defaults);
  const query = readQuery(params, defaults);
  for (const key of storySearchKeys) {
    const value = query[key];
    // Fixed route constraints (e.g. /truyen-full) cannot be overridden in the URL.
    if (key in fixed || value === undefined || value === "" || value === fallback[key]) params.delete(key);
    else params.set(key, String(value));
  }
  return params;
}

export function storySearchHref(pathname: string, params: URLSearchParams) {
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

interface SearchSnapshot { search: string; keyword: string; pending: boolean }
interface NavigationOptions { method?: "push" | "replace"; resetPage?: boolean }

// One coordinator per listing. In-flight URL changes and a debounced keyword share
// the same latest parameters, so neither can restore an older filter snapshot.
export function createStorySearchController({
  pathname, initialSearch, navigate, config = {}, debounceMs = 350,
  schedule = (callback: () => void, delay: number) => setTimeout(callback, delay),
  cancel = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}: {
  pathname: string;
  initialSearch: string;
  navigate: (href: string, method: "push" | "replace") => void;
  config?: StorySearchConfig;
  debounceMs?: number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const normalize = (search: string) => storySearchParams(search, {}, { ...config, resetPage: false }).toString();
  let committed = normalize(initialSearch);
  let state: SearchSnapshot = { search: committed, keyword: new URLSearchParams(committed).get("q") ?? "", pending: false };
  const initialState = state;
  const listeners = new Set<() => void>();
  const targets = new Set<string>();
  let target: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function publish(next: SearchSnapshot) {
    if (next.search === state.search && next.keyword === state.keyword && next.pending === state.pending) return;
    state = next;
    listeners.forEach((listener) => listener());
  }
  function stopDebounce() {
    generation += 1;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function request(search: string, method: "push" | "replace") {
    if (search === committed && target === null) {
      publish({ ...state, pending: false });
      return;
    }
    target = search;
    targets.add(search);
    publish({ ...state, pending: true });
    navigate(storySearchHref(pathname, new URLSearchParams(search)), method);
  }
  function update(changes: StorySearchChanges, { method = "push", resetPage = true }: NavigationOptions = {}) {
    stopDebounce();
    const search = storySearchParams(state.search, changes, { ...config, resetPage }).toString();
    publish({ search, keyword: new URLSearchParams(search).get("q") ?? "", pending: true });
    request(search, method);
  }
  function reset(search: string) {
    stopDebounce();
    targets.clear();
    target = null;
    committed = normalize(search);
    publish({ search: committed, keyword: new URLSearchParams(committed).get("q") ?? "", pending: false });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    getQuery: () => ({ ...readQuery(new URLSearchParams(state.search), config.defaults), ...config.fixed }),
    update,
    setKeyword(value: string) {
      stopDebounce();
      const keyword = value.slice(0, storySearchMaxLength);
      const search = storySearchParams(state.search, { q: keyword }, config).toString();
      publish({ search, keyword, pending: true });
      const version = generation;
      timer = schedule(() => {
        if (version !== generation) return;
        timer = null;
        request(state.search, "replace");
      }, debounceMs);
    },
    submit() { update({ q: state.keyword }); },
    clear() {
      stopDebounce();
      const search = storySearchParams(state.search, {}, { ...config, clear: true }).toString();
      publish({ search, keyword: "", pending: true });
      request(search, "push");
    },
    acceptRoute(search: string, navigating: boolean) {
      const incoming = normalize(search);
      const previous = committed;
      committed = incoming;
      if (incoming === target) {
        target = null;
        targets.clear();
        // A response for the previous keyword must not erase text typed afterwards.
        if (timer === null) publish({ search: incoming, keyword: new URLSearchParams(incoming).get("q") ?? "", pending: navigating });
        return;
      }
      if (navigating && target !== null && (incoming === previous || targets.has(incoming))) return;
      if (timer !== null && (incoming === previous || targets.has(incoming))) return;
      reset(incoming);
    },
    reset,
    stopDebounce,
  };
}

export type StorySearchController = ReturnType<typeof createStorySearchController>;
