"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Search,
  Menu,
  X,
  Bell,
  ChevronDown,
  User,
  BookMarked,
  History,
  LogOut,
  TrendingUp,
  Shield,
  Coins,
  PenLine,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import NotificationBell from "@/components/notifications/NotificationBell";
import AccountThemeToggle from "@/components/account/AccountThemeToggle";
import ReaderAvatar from "@/components/account/ReaderAvatar";
import HeaderSearch from "@/components/search/HeaderSearch";

const NAV_LINKS = [
  { label: "Trang chủ", href: "/" },
  { label: "Thể loại", href: "/the-loai" },
  { label: "Truyện mới", href: "/truyen-moi" },
  { label: "Truyện Full", href: "/truyen-full" },
  { label: "Xếp hạng", href: "/xep-hang" },
];

const USER_MENU = [
  { label: "Khu vực sáng tác", href: "/studio", icon: PenLine },
  { label: "Thông tin cá nhân", href: "/profile", icon: User },
  { label: "Ví xu", href: "/vi-xu", icon: Coins },
  { label: "Tủ truyện", href: "/tu-sach", icon: BookMarked },
  { label: "Lịch sử đọc", href: "/lich-su", icon: History },
  { label: "Thông báo", href: "/thong-bao", icon: Bell },
];

export default function Header() {
  const pathname = usePathname();
  return <HeaderContent key={pathname} />;
}

function HeaderContent() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const scrolledRef = useRef(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // GSAP animation for user dropdown
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (userMenuOpen && dropdownRef.current) {
      gsap.fromTo(
        dropdownRef.current,
        { opacity: 0, y: -8, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "back.out(1.5)" }
      );
    }
  }, { dependencies: [userMenuOpen], scope: headerRef, revertOnUpdate: true });

  // GSAP animation for mobile drawer
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (mobileOpen && mobileMenuRef.current) {
      gsap.fromTo(
        mobileMenuRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }
      );
      gsap.fromTo(
        ".mobile-nav-link",
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, stagger: 0.04, duration: 0.25, ease: "power2.out", delay: 0.05 }
      );
    }
  }, { dependencies: [mobileOpen], scope: headerRef, revertOnUpdate: true });

  // Detect scroll for shadow
  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 8;
      if (scrolledRef.current !== next) {
        scrolledRef.current = next;
        setScrolled(next);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName = user?.hoTen || user?.tenTaiKhoan || "Thành viên";
  const isAdmin = user?.roles?.includes("admin");

  return (
    <>
      <header
        ref={headerRef}
        className={`sticky top-0 z-50 w-full bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-zinc-800/70 transition-shadow duration-200 ${
          scrolled ? "shadow-md shadow-slate-900/5 dark:shadow-black/20" : ""
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          {/* ── Logo ── */}
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="WebNovel Trang chủ"
          >
            <div className="relative w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-shadow">
              <BookOpen className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <span className="hidden text-lg font-extrabold tracking-tight text-slate-900 select-none min-[420px]:inline dark:text-white">
              WEB<span className="text-blue-600 dark:text-blue-400">NOVEL</span>
            </span>
          </Link>

          {/* ── Desktop Navigation ── */}
          <nav className="hidden xl:flex items-center gap-1" aria-label="Navigation chính">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Desktop Search */}
            <HeaderSearch />

            {/* Mobile Search Button */}
            <button
              className="sm:hidden w-9 h-9 flex items-center justify-center rounded-full text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Tìm kiếm"
            >
              <Search className="h-5 w-5" />
            </button>

            <AccountThemeToggle compact />
            <NotificationBell />

            {/* User / Auth State */}
            {!loading && user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-expanded={userMenuOpen}
                  aria-label="Menu tài khoản"
                >
                  <ReaderAvatar url={user.anh ?? null} name={displayName} size={32} />
                  <div className="hidden lg:flex flex-col text-left leading-tight">
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-200 line-clamp-1 max-w-[120px]">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                  <Coins className="w-2.5 h-2.5" /> {(user.soDuXu ?? 0).toLocaleString("vi-VN")} xu
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                      userMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/30 overflow-hidden py-2 z-50 will-change-transform"
                  >
                    {/* User Header in Dropdown */}
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800 mb-1">
                      <p className="text-xs text-slate-400">Xin chào,</p>
                      <p className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate">
                        {displayName}
                      </p>
                      <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                    <Coins className="w-3 h-3" /> Số dư: {(user.soDuXu ?? 0).toLocaleString("vi-VN")} xu
                      </div>
                    </div>

                    {/* Admin portal if role is admin */}
                    {isAdmin && (
                      <Link
                        href="/admin/dashboard"
                        className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      >
                        <Shield className="h-4 w-4" />
                        Trang Quản Trị (Admin)
                      </Link>
                    )}

                    {USER_MENU.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-2 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
                      >
                        <item.icon className="h-4 w-4 text-slate-400" />
                        {item.label}
                      </Link>
                    ))}

                    <div className="my-1.5 border-t border-slate-100 dark:border-zinc-800" />
                    <button
                      onClick={logout}
                      className="flex items-center gap-3 w-full px-4 py-2 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/dang-nhap"
                  className="hidden sm:flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-full shadow-sm shadow-blue-500/25 transition-all duration-150"
                >
                  <User className="h-3.5 w-3.5" />
                  Đăng nhập
                </Link>
                <Link
                  href="/dang-ky"
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 text-slate-700 dark:text-zinc-200 text-xs font-medium rounded-full transition-all duration-150"
                >
                  Đăng ký
                </Link>
              </div>
            )}

            {/* Mobile Hamburger */}
            <button
              className="xl:hidden w-9 h-9 flex items-center justify-center rounded-full text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Mobile Search Overlay ── */}
        {searchOpen && (
          <div className="sm:hidden border-t border-slate-100 bg-white px-4 pb-4 pt-2 dark:border-zinc-800 dark:bg-zinc-950"><HeaderSearch mobile onNavigate={() => setSearchOpen(false)} /></div>
        )}

        {/* ── Mobile Menu Drawer ── */}
        {mobileOpen && (
          <div
            ref={mobileMenuRef}
            className="xl:hidden border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 space-y-1"
          >
            {/* User card on mobile if logged in */}
            {user && (
              <div className="mobile-nav-link p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl mb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <Link href="/profile" className="block truncate rounded-sm text-sm font-bold text-slate-800 hover:underline focus-visible:outline-2 dark:text-zinc-200">
                    {displayName}
                  </Link>
                    <Link href="/studio" onClick={() => setMobileOpen(false)} className="inline-flex min-h-10 items-center rounded-sm text-xs font-medium text-sky-700 hover:underline focus-visible:outline-2 dark:text-sky-400">
                      Khu vực sáng tác
                    </Link>
                    <Link href="/vi-xu" className="inline-flex min-h-10 items-center rounded-sm text-xs font-medium text-amber-700 hover:underline focus-visible:outline-2 dark:text-amber-400">
                    Ví xu · {(user.soDuXu ?? 0).toLocaleString("vi-VN")} xu
                  </Link>
                </div>
                {isAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="px-2.5 py-1 bg-blue-600 text-white text-[11px] font-semibold rounded-lg"
                  >
                    Admin
                  </Link>
                )}
              </div>
            )}

            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`mobile-nav-link flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                      : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  {isActive && <TrendingUp className="h-3.5 w-3.5" />}
                  {link.label}
                </Link>
              );
            })}

            {/* Mobile Auth actions */}
            {!user ? (
              <div className="mobile-nav-link pt-2 border-t border-slate-100 dark:border-zinc-800 flex flex-col gap-2">
                <Link
                  href="/dang-nhap"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <User className="h-4 w-4" />
                  Đăng nhập
                </Link>
                <Link
                  href="/dang-ky"
                  className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-sm font-medium rounded-xl transition-colors"
                >
                  Đăng ký tài khoản
                </Link>
              </div>
            ) : (
              <div className="mobile-nav-link pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  onClick={logout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-500 font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        )}
      </header>
    </>
  );
}
