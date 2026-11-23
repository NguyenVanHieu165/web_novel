"use client";

import { useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { password: string; onPasswordChange: (value: string) => void; confirmPassword?: string; onConfirmPasswordChange?: (value: string) => void; disabled?: boolean; passwordLabel?: string; confirmLabel?: string; id?: string };
const checks = (password: string) => [
  ["Tối thiểu 8 ký tự", password.length >= 8], ["Có chữ thường", /[a-z]/.test(password)], ["Có chữ in hoa", /[A-Z]/.test(password)], ["Có chữ số", /\d/.test(password)], ["Có ký tự đặc biệt", /[^a-zA-Z0-9]/.test(password)],
] as const;

export default function PasswordStrengthInput({ password, onPasswordChange, confirmPassword, onConfirmPasswordChange, disabled, passwordLabel = "Mật khẩu", confirmLabel = "Xác nhận mật khẩu", id = "password" }: Props) {
  const [show, setShow] = useState(false);
  const score = checks(password).filter(([, passed]) => passed).length;
  const level = score <= 1 ? "Rất yếu" : score === 2 ? "Yếu" : score <= 4 ? "Khá" : "Mạnh";
  const tone = score <= 1 ? "bg-destructive" : score === 2 ? "bg-warning" : score <= 4 ? "bg-warning" : "bg-success";
  return <div className="space-y-3"><div><Label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{passwordLabel}</Label><div className="relative"><Input id={id} name={id} type={show ? "text" : "password"} required value={password} onChange={event => onPasswordChange(event.target.value)} disabled={disabled} autoComplete="new-password" maxLength={128} className="h-11 rounded-xl bg-muted/40 pr-10" /><Button type="button" variant="ghost" size="icon-sm" onClick={() => setShow(value => !value)} className="absolute right-2 top-1.5 text-muted-foreground" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button></div></div>
    <div><div className="mb-1 flex gap-1" aria-hidden="true">{[0, 1, 2, 3].map(index => <span key={index} className={`h-1 flex-1 rounded ${index < Math.max(1, Math.ceil(score / 1.25)) ? tone : "bg-muted"}`} />)}</div><p className="text-xs text-muted-foreground">Độ mạnh: <strong className="text-foreground">{level}</strong></p><ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{checks(password).map(([label, passed]) => <li key={label} className={passed ? "text-success" : "text-muted-foreground"}>{passed ? <Check aria-hidden="true" className="mr-1 inline size-3" /> : <X aria-hidden="true" className="mr-1 inline size-3" />}{label}</li>)}</ul></div>
    {onConfirmPasswordChange !== undefined && <div><Label htmlFor={`${id}-confirm`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{confirmLabel}</Label><Input id={`${id}-confirm`} name={`${id}-confirm`} type={show ? "text" : "password"} required value={confirmPassword ?? ""} onChange={event => onConfirmPasswordChange(event.target.value)} disabled={disabled} autoComplete="new-password" maxLength={128} className="h-11 rounded-xl bg-muted/40" />{confirmPassword ? <p aria-live="polite" className={`mt-1 text-xs ${confirmPassword === password ? "text-success" : "text-destructive"}`}>{confirmPassword === password ? "Mật khẩu xác nhận khớp" : "Mật khẩu xác nhận chưa khớp"}</p> : null}</div>}
  </div>;
}
