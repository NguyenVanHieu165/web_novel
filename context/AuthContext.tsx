"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface UserSession {
  idTaiKhoan: number;
  tenTaiKhoan: string;
  email: string;
  roles: string[];
  soDuXu?: number;
  hoTen?: string;
  anh?: string | null;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
});

async function readUserSession(signal?: AbortSignal): Promise<UserSession | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store", signal });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
      return null;
    }

    const data: { success?: boolean; user?: UserSession } = await res.json();
    return data.success ? data.user ?? null : null;
  } catch (error) {
    if (!signal?.aborted) console.error("Fetch User Error:", error);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const sessionReadVersion = useRef(0);

  const fetchUser = useCallback((signal?: AbortSignal) => {
    const version = ++sessionReadVersion.current;
    return readUserSession(signal).then((session) => {
      if (signal?.aborted || version !== sessionReadVersion.current) return;
      setUser(session);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUser(controller.signal);
    return () => controller.abort();
  }, [fetchUser]);

  const logout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        sessionReadVersion.current += 1;
        setUser(null);
        setLoading(false);
        toast.success("Đã đăng xuất tài khoản");
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      console.error("Logout Error:", error);
      toast.error("Không thể đăng xuất, vui lòng thử lại");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, logout, refreshUser: fetchUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
