import * as Y from "yjs";

export interface CollaborativeRoom {
  doc: Y.Doc;
  users: Set<string>; // Set of user identifiers (e.g. username or socket.id)
  lastActive: Date;
}

// Maps chapterId (number) -> CollaborativeRoom
export const activeRooms = new Map<number, CollaborativeRoom>();
