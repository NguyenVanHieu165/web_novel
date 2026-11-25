import assert from "node:assert/strict";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const text = value => Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" ? text(value.props?.children) : String(value ?? "");
const row = id => ({ idBinhLuan: id, noiDung: `comment-${id}`, likeCount: 0, createdAt: "today", authorName: `author-${id}`, isAuthor: false, isAdmin: false, isLiked: false, isOwn: false, chapterNumber: null });
const page = (ids, current = 1, total = 16) => ({ success: true, data: ids.map(row), meta: { page: current, limit: 15, total, totalPage: Math.ceil(total / 15) } });

function harness() {
  let states = [], slots = [], effects = [], index = 0, scope, mounted = true;
  const requests = [], timers = new Map();
  let user = { idTaiKhoan: 7, tenTaiKhoan: "reader", roles: ["user"] };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], next => { if (mounted) states[i] = typeof next === "function" ? next(states[i]) : next; }]; },
    useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const component = load("components/comments/CommentSection.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { __esModule: true, default: "a" },
    "@/context/AuthContext": { useAuth: () => ({ user }) },
    "lucide-react": new Proxy({}, { get: (_, key) => key }),
    ...Object.fromEntries(["alert", "badge", "button", "card", "textarea"].map(name => [`@/components/ui/${name}`, new Proxy({}, { get: (_, key) => key === "Button" ? "button" : key === "Textarea" ? "textarea" : key })])),
  }, {
    crypto: { randomUUID: () => "test-pending" },
    window: { setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } },
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve: body => resolve({ ok: true, json: async () => body }), reject })),
  }).default;
  const cleanup = () => { for (const slot of slots) slot?.cleanup?.(); };
  let props = { storySlug: "story", chapterId: 11 };
  return {
    requests,
    render(nextProps = props) {
      props = nextProps; index = 0;
      let tree = component(props);
      if (typeof tree?.type === "function") {
        if (scope !== tree.key) { cleanup(); states = []; slots = []; effects = []; scope = tree.key; }
        index = 0; tree = tree.type(tree.props);
      }
      while (effects.length) effects.shift()();
      const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) fn();
      return tree;
    },
    account(id) { user = id === null ? null : { ...user, idTaiKhoan: id }; },
    unmount() { cleanup(); mounted = false; },
  };
}
const button = (tree, label) => nodes(tree, node => node.type === "button" && text(node.props.children) === label)[0];
const settle = () => new Promise(setImmediate);

test("loads all root comments and replies independently, deduplicating shifted pages and retries", async () => {
  const h = harness(); let tree = h.render();
  h.requests[0].resolve(page(Array.from({ length: 15 }, (_, i) => i + 1))); await settle(); tree = h.render();
  assert.ok(button(tree, "Xem thêm bình luận"), "page metadata exposes the next page");
  button(tree, "Xem thêm bình luận").props.onClick();
  assert.match(h.requests[1].url, /page=2/);
  h.requests[1].reject(new Error("offline")); await settle(); tree = h.render();
  button(tree, "Thử tải lại bình luận").props.onClick();
  assert.match(h.requests[2].url, /page=2/);
  h.requests[2].resolve(page([15, 16], 2)); await settle(); tree = h.render();
  assert.equal(nodes(tree, node => node.type === "Card").length, 16);
  assert.equal(button(tree, "Xem thêm bình luận"), undefined);
  nodes(tree, node => node.props["aria-label"] === "Trả lời bình luận của author-1")[0].props.onClick();
  assert.match(h.requests[3].url, /replyTo=1/); h.requests[3].resolve(page(Array.from({ length: 15 }, (_, i) => 101 + i))); await settle(); tree = h.render();
  button(tree, "Xem thêm phản hồi").props.onClick();
  assert.match(h.requests[4].url, /page=2/); h.requests[4].resolve(page([115, 116], 2)); await settle(); tree = h.render();
  assert.ok(text(tree).includes("comment-116")); assert.equal(text(tree).split("comment-115").length - 1, 1);
  h.unmount();
});

test("story, chapter and account changes reset threads and ignore responses from the old scope", async () => {
  const h = harness(); h.render();
  h.render({ storySlug: "other", chapterId: 12 });
  h.requests[1].resolve(page([22], 1, 1)); await settle();
  h.requests[0].resolve(page([11], 1, 1)); await settle();
  let tree = h.render(); assert.ok(text(tree).includes("comment-22")); assert.ok(!text(tree).includes("comment-11"));
  h.account(8); tree = h.render(); assert.ok(!text(tree).includes("comment-22"));
  assert.match(h.requests[2].url, /chapterId=12/);
  h.unmount(); assert.equal(h.requests[2].options.signal.aborted, true);
});

test("a first-page response cannot discard an optimistic comment before success or rollback", async () => {
  const h = harness(); let tree = h.render();
  nodes(tree, node => node.type === "textarea")[0].props.onChange({ target: { value: "new comment" } }); tree = h.render();
  const posting = nodes(tree, node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  h.requests[1].resolve({ success: true, data: row(99) }); await posting;
  h.requests[0].resolve(page([1], 1, 1)); await settle(); tree = h.render();
  assert.ok(text(tree).includes("comment-99")); assert.ok(text(tree).includes("comment-1"));
  nodes(tree, node => node.type === "textarea")[0].props.onChange({ target: { value: "retry me" } }); tree = h.render();
  const failing = nodes(tree, node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  h.requests[2].reject(new Error("offline")); await failing; tree = h.render();
  assert.equal(nodes(tree, node => node.type === "textarea")[0].props.value, "retry me");
  assert.ok(!nodes(tree, node => node.type === "Card").some(node => text(node).includes("retry me")));
  h.unmount();
});

test("pending comments survive a GET and reconcile without duplicates when the API already includes them", async () => {
  const h = harness(); let tree = h.render();
  nodes(tree, node => node.type === "textarea")[0].props.onChange({ target: { value: "pending text" } }); tree = h.render();
  const posting = nodes(tree, node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
  h.requests[0].resolve(page([99, 1], 1, 2)); await settle(); tree = h.render();
  assert.ok(text(tree).includes("pending text"));
  h.requests[1].resolve({ success: true, data: row(99) }); await posting; tree = h.render();
  assert.equal(nodes(tree, node => node.type === "Card").length, 2);
  assert.ok(!text(tree).includes("pending text")); h.unmount();
});

test("reply pagination retries the failed page and keeps other parents independent", async () => {
  const h = harness(); let tree = h.render();
  h.requests[0].resolve(page([1, 2], 1, 2)); await settle(); tree = h.render();
  nodes(tree, node => node.props["aria-label"] === "Trả lời bình luận của author-1")[0].props.onClick();
  nodes(tree, node => node.props["aria-label"] === "Trả lời bình luận của author-2")[0].props.onClick();
  h.requests[2].resolve(page([201], 1, 1)); h.requests[1].reject(new Error("offline")); await settle(); tree = h.render();
  assert.ok(text(tree).includes("comment-201"));
  button(tree, "Thử tải lại phản hồi").props.onClick();
  assert.match(h.requests[3].url, /replyTo=1/); assert.match(h.requests[3].url, /page=1/);
  h.requests[3].resolve(page([101], 1, 1)); await settle(); tree = h.render();
  assert.ok(text(tree).includes("comment-101")); assert.ok(text(tree).includes("comment-201")); h.unmount();
});
