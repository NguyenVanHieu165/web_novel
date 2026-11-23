import Module, { registerHooks } from "node:module";

const serverOnlyMockUrl = "data:text/javascript,export default {}";
const originalLoad = Module._load;

Module._load = function loadWithServerOnlyMock(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: serverOnlyMockUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
