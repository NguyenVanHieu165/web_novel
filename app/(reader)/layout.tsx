import ReaderShell from "@/components/layout/ReaderShell";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ReaderShell>{children}</ReaderShell>
      <Toaster position="top-center" richColors closeButton />
    </AuthProvider>
  );
}
