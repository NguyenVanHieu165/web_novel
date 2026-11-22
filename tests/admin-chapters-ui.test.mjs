import assert from "node:assert/strict";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

function component(file, mocks = {}, globals = {}) {
  const states = [], refs = [];
  let index = 0;
  const react = {
    useState(value) { const slot = index++; if (!(slot in states)) states[slot] = typeof value === "function" ? value() : value; return [states[slot], (next) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }]; },
    useRef(value) { const slot = index++; return refs[slot] ?? (refs[slot] = { current: value }); },
    useId() { index++; return "fixture-id"; },
  };
  const jsx = (type, props) => ({ type, props });
  const DragDropContext = "DragDropContext", Droppable = "Droppable", Draggable = "Draggable";
  const exports = load(file, {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/input": { Input: "input" },
    "lucide-react": new Proxy({}, { get: (_, key) => key }),
    "@/hooks/useReorderedItems": { useReorderedItems: (data) => ({ items: data, reorder() {} }) },
    "@hello-pangea/dnd": { DragDropContext, Droppable, Draggable },
    "./ChapterPriceSheet": { __esModule: true, default: "ChapterPriceSheet" },
    sonner: { toast: { success() {}, error() {} } }, ...mocks,
  }, globals);
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(expand);
    const props = { ...node.props };
    if (typeof props.children === "function") props.children = props.children({ innerRef() {}, droppableProps: {}, draggableProps: {}, dragHandleProps: {}, placeholder: null });
    props.children = expand(props.children);
    return { ...node, props };
  }
  return { states, render(props) { index = 0; return expand(exports.default(props)); } };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

test("searchable combobox finds a story beyond the first 100 and supports keyboard selection/clear", () => {
  const selected = [];
  const h = component("components/chapters/StoryCombobox.tsx");
  const props = { stories: Array.from({ length: 150 }, (_, i) => ({ idTruyen: i + 1, tenTruyen: i === 149 ? "Truyện tiếng Việt" : `Truyện số ${i + 1}` })), value: undefined, onChange: (id) => selected.push(id) };
  let tree = h.render(props);
  const input = () => nodes(tree, (node) => node.props.role === "combobox")[0];
  input().props.onFocus(); tree = h.render(props);
  input().props.onChange({ target: { value: "tiếng Việt" } }); tree = h.render(props);
  assert.equal(nodes(tree, (node) => node.props.role === "option").length, 1);
  input().props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.deepEqual(selected, [150]);
  tree = h.render({ ...props, value: 150 });
  nodes(tree, (node) => node.props["aria-label"] === "Xóa lựa chọn truyện")[0].props.onClick();
  assert.deepEqual(selected, [150, undefined]);
});

test("table selects three chapters, submits one bulk free update and opens the requested preview", async () => {
  const calls = [], previews = [];
  let refreshes = 0;
  const h = component("components/chapters/ChapterTable.tsx", { "@/lib/axios": { __esModule: true, default: { post: async (url, body) => { calls.push({ url, body }); return { data: { success: true, data: { count: 3 } } }; } } } });
  const props = { data: [1, 2, 3].map((idChuong) => ({ idChuong, chuongSo: idChuong, tieuDeChuong: `Chương ${idChuong}`, slug: `chapter-${idChuong}`, giaXu: 5, wordCount: 120 })), query: { sortBy: "soChuong", sortOrder: "asc" }, onEdit() {}, onPreview: (id) => previews.push(id), onSort() {}, refresh: () => { refreshes++; } };
  let tree = h.render(props);
  nodes(tree, (node) => node.props["aria-label"] === "Chọn tất cả trên trang")[0].props.onChange({ target: { checked: true } });
  tree = h.render(props);
  const price = nodes(tree, (node) => node.props.children === "Đặt giá VIP")[0];
  price.props.onClick(); tree = h.render(props);
  const sheet = nodes(tree, (node) => node.type === "ChapterPriceSheet")[0];
  assert.deepEqual(Array.from(sheet.props.target.ids), [1, 2, 3]);
  nodes(tree, (node) => node.props.children === "Chuyển miễn phí")[0].props.onClick();
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(calls[0].url, "/admin/chapters/bulk"); assert.equal(calls[0].body.action, "set-free");
  assert.deepEqual(Array.from(calls[0].body.chapterIds), [1, 2, 3]); assert.equal(refreshes, 1);
  tree = h.render(props);
  const view = nodes(tree, (node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Xem"))[1];
  view.props.onClick(); assert.deepEqual(previews, [2]);
});
