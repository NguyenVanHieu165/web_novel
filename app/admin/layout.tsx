import Sidebar from "@/components/admin/Sidebar";
import Navbar from "@/components/admin/Navbar";
import { Toaster } from "@/components/ui/sonner";
import { requireAdminPage } from "@/lib/server/admin-page";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-background"
      style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
    >
      <a href="#admin-main" className="sr-only z-[100] rounded-md bg-background px-4 py-2 text-foreground shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-ring">
        Bỏ qua điều hướng
      </a>
      {/* Sidebar - Cố định bên trái */}
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Navbar - Cố định phía trên */}
        <Navbar />
        {/* Content Area - Cuộn độc lập */}
        <main id="admin-main" className="flex-1 scroll-mt-4 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
        <Toaster
          position="top-center"
          richColors
          closeButton
          expand={true}
          visibleToasts={5}
          duration={5000}
        />
      </div>
    </div>
  );
}
