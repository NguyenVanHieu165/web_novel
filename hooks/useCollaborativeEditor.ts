import { useEffect, useMemo, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import * as Y from "yjs";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { yCollab } from "y-codemirror.next";
import * as awarenessProtocol from "y-protocols/awareness";

interface UseCollaborativeEditorProps {
  chapterId: number;
  initialContent: string;
  enabled: boolean;
  userName: string; // Bắt buộc để hiển thị con trỏ chuột màu sắc
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
}

const CURSOR_COLORS = [
  { color: "#30bced", light: "#30bced33" },
  { color: "#6eeb83", light: "#6eeb8333" },
  { color: "#ffbc42", light: "#ffbc4233" },
  { color: "#ecd444", light: "#ecd44433" },
  { color: "#ee6352", light: "#ee635233" },
  { color: "#9ac2c9", light: "#9ac2c933" },
] as const;

function getCursorColor(userName: string) {
  const hash = Array.from(userName).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

// Định nghĩa giao diện CSS cho con trỏ chuột của người dùng khác
const collabTheme = EditorView.theme({
  ".cm-ySelection": {
    backgroundColor: "var(--y-color-light, rgba(0, 0, 0, 0.15))",
  },
  ".cm-ySelectionCaret": {
    position: "relative",
    borderLeft: "2px solid var(--y-color)",
    borderRight: "none",
    marginLeft: "-1px",
    marginRight: "-1px",
    boxSizing: "border-box",
  },
  ".cm-ySelectionInfo": {
    position: "absolute",
    top: "-1.2em",
    left: "-1px",
    fontSize: "10px",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    lineHeight: "normal",
    userSelect: "none",
    color: "white",
    padding: "1px 4px",
    borderRadius: "3px",
    backgroundColor: "var(--y-color)",
    whiteSpace: "nowrap",
    zIndex: "10",
    transition: "opacity .3s ease-in-out",
    opacity: "0",
    pointerEvents: "none",
  },
  ".cm-ySelectionCaret:hover .cm-ySelectionInfo": {
    opacity: "1",
  },
});

export function useCollaborativeEditor({
  chapterId,
  initialContent,
  enabled,
  userName,
  editorContainerRef,
}: UseCollaborativeEditorProps) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  const socketRef = useRef<Socket | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const userColor = useMemo(() => getCursorColor(userName), [userName]);

  useEffect(() => {
    if (!enabled || !chapterId || !editorContainerRef.current) {
      setIsConnected(false);
      setOnlineUsers([]);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      return;
    }

    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
    const socket = io(socketServerUrl, {
      transports: ["websocket"],
      withCredentials: true,
    });
    socketRef.current = socket;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    
    // Khởi tạo đối tượng Awareness của Yjs để quản lý con trỏ chuột thời gian thực
    const awareness = new awarenessProtocol.Awareness(ydoc);

    // Thiết lập thông tin profile cho con trỏ cục bộ của mình
    awareness.setLocalStateField("user", {
      name: userName,
      color: userColor.color,
      light: userColor.light,
    });

    // Phát đi thay đổi awareness (con trỏ/selection) cục bộ lên server
    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: string) => {
      if (origin === "local" && socketRef.current) {
        const update = awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          added.concat(updated).concat(removed)
        );
        socketRef.current.emit("awareness-update", { chapterId, update });
      }
    });

    socket.on("awareness-update-client", (update: ArrayBuffer) => {
      awarenessProtocol.applyAwarenessUpdate(awareness, new Uint8Array(update), "remote");
    });

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join-chapter", {
        chapterId,
        initialContent,
        stateUpdate: Y.encodeStateAsUpdate(ydoc),
      });

      // Khi vừa kết nối, phát trạng thái awareness hiện tại lên server
      const localAwarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID]);
      socket.emit("awareness-update", { chapterId, update: localAwarenessUpdate });
    });

    socket.on("connect_error", () => setIsConnected(false));

    // Nhận tài liệu ban đầu từ Server
    socket.on("initial-document", (stateUpdate: ArrayBuffer) => {
      Y.applyUpdate(ydoc, new Uint8Array(stateUpdate), "remote");
      socket.emit("update-crdt", {
        chapterId,
        update: Y.encodeStateAsUpdate(ydoc),
      });

      // Khởi tạo CodeMirror và "buộc" nó vào Yjs
      const state = EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          collabTheme, // Style css cho con trỏ/vùng chọn cộng tác
          // Plugin ma thuật: Tự động đồng bộ hai chiều và đồng bộ awareness con trỏ
          yCollab(ytext, awareness),
        ],
      });

      if (editorContainerRef.current) {
        // Xóa editor cũ nếu có
        if (editorViewRef.current) editorViewRef.current.destroy();

        const view = new EditorView({
          state,
          parent: editorContainerRef.current,
        });
        editorViewRef.current = view;
      }
    });

    // Nhận cập nhật văn bản nhị phân từ các máy khác
    socket.on("crdt-update", (update: ArrayBuffer) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), "remote");
    });

    socket.on("document-state", ({ status }: { status: "saved" }) => {
      if (status === "saved") setSaveStatus("saved");
    });

    socket.on("users-online", ({ users }: { users: string[] }) => {
      setOnlineUsers(users);
    });

    // Khi CodeMirror làm thay đổi Yjs cục bộ -> bắn update lên server
    ydoc.on("update", (update, origin) => {
      if (origin === "remote") return;
      if (!socketRef.current) return;
      setSaveStatus("saving");
      socketRef.current.emit("update-crdt", { chapterId, update });
    });

    return () => {
      socket.emit("leave-chapter", { chapterId });
      socket.disconnect();
      ydoc.destroy();
      awareness.destroy();
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [enabled, chapterId, userName, initialContent, editorContainerRef, userColor]);

  // Hàm lấy nội dung hiện tại ra khi cần (ví dụ để lưu vào Database khi bấm nút "Lưu")
  const getContent = () => {
    return editorViewRef.current ? editorViewRef.current.state.doc.toString() : initialContent;
  };

  return {
    onlineUsers,
    isConnected,
    saveStatus,
    getContent,
  };
}
