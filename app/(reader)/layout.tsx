import ReaderShell from "@/components/layout/ReaderShell";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

// Reader routes use authenticated, database-backed data at request time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
