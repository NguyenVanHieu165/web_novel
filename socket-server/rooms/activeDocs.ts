import * as Y from "yjs";

export interface CollaborativeRoom {
  doc: Y.Doc;
  users: Map<string, Set<string>>;
  lastActive: Date;
  gcTimeout?: ReturnType<typeof setTimeout>;
}

// Maps chapterId (number) -> CollaborativeRoom
export const activeRooms = new Map<number, CollaborativeRoom>();
