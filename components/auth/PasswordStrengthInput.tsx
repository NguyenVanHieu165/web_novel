"use client";

import { useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";

type Props = { password: string; onPasswordChange: (value: string) => void; confirmPassword?: string; onConfirmPasswordChange?: (value: string) => void; disabled?: boolean; passwordLabel?: string; confirmLabel?: string; id?: string };
const checks = (password: string) => [
  ["Tối thiểu 8 ký tự", password.length >= 8], ["Có chữ thường", /[a-z]/.test(password)], ["Có chữ in hoa", /[A-Z]/.test(password)], ["Có chữ số", /\d/.test(password)], ["Có ký tự đặc biệt", /[^a-zA-Z0-9]/.test(password)],
] as const;

export default function PasswordStrengthInput({ password, onPasswordChange, confirmPassword, onConfirmPasswordChange, disabled, passwordLabel = "Mật khẩu", confirmLabel = "Xác nhận mật khẩu", id = "password" }: Props) {
  const [show, setShow] = useState(false);
  const score = checks(password).filter(([, passed]) => passed).length;
  const level = score <= 1 ? "Rất yếu" : score === 2 ? "Yếu" : score <= 4 ? "Khá" : "Mạnh";
  const tone = score <= 1 ? "bg-red-500" : score === 2 ? "bg-orange-500" : score <= 4 ? "bg-amber-500" : "bg-emerald-500";
  return <div className="space-y-3"><div><label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">{passwordLabel}</label><div className="relative"><input id={id} type={show ? "text" : "password"} required value={password} onChange={event => onPasswordChange(event.target.value)} disabled={disabled} autoComplete="new-password" maxLength={128} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-10 text-sm text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100" /><button type="button" onClick={() => setShow(value => !value)} className="absolute right-3 top-2.5 text-slate-400" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
    <div><div className="mb-1 flex gap-1">{[0, 1, 2, 3].map(index => <span key={index} className={`h-1 flex-1 rounded ${index < Math.max(1, Math.ceil(score / 1.25)) ? tone : "bg-slate-200 dark:bg-zinc-700"}`} />)}</div><p className="text-xs text-slate-500">Độ mạnh: <strong>{level}</strong></p><ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{checks(password).map(([label, passed]) => <li key={label} className={passed ? "text-emerald-600" : "text-slate-500"}>{passed ? <Check className="mr-1 inline h-3 w-3" /> : <X className="mr-1 inline h-3 w-3" />}{label}</li>)}</ul></div>
    {onConfirmPasswordChange !== undefined && <div><label htmlFor={`${id}-confirm`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">{confirmLabel}</label><input id={`${id}-confirm`} type={show ? "text" : "password"} required value={confirmPassword ?? ""} onChange={event => onConfirmPasswordChange(event.target.value)} disabled={disabled} autoComplete="new-password" maxLength={128} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100" />{confirmPassword ? <p className={`mt-1 text-xs ${confirmPassword === password ? "text-emerald-600" : "text-red-600"}`}>{confirmPassword === password ? "Mật khẩu xác nhận khớp" : "Mật khẩu xác nhận chưa khớp"}</p> : null}</div>}
  </div>;
}
