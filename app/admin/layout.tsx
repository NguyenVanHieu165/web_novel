"use client";

import Sidebar from "@/components/admin/Sidebar";
import Navbar from "@/components/admin/Navbar";
import { Toaster } from "@/components/ui/sonner";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      {/* Sidebar - Cố định bên trái */}
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Navbar - Cố định phía trên */}
        <Navbar />
        {/* Content Area - Cuộn độc lập */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
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
