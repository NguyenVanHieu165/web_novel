export type AdminTopUpStatus = "pending" | "success" | "failed" | "cancelled";

export type AdminTopUpItem = {
  id: number;
  code: string | null;
  coins: number;
  amountVnd: number;
  status: AdminTopUpStatus;
  method: "momo" | "vnpay" | "bank" | "khuyen_mai";
  note: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
  account: {
    id: number;
    username: string;
    email: string;
  };
};

export type AdminTopUpListResponse =
  | {
      success: true;
      data: AdminTopUpItem[];
      meta: { page: number; limit: number; total: number; totalPage: number };
    }
  | { success: false; message: string };
