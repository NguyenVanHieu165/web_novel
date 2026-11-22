import { z } from "zod";

const resultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  field: z.string().optional(),
});

export async function submitAccountForm(path: string, method: "PUT" | "POST", data: object) {
  try {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const parsed = resultSchema.safeParse(await response.json());
    if (parsed.success) {
      return { ...parsed.data, success: response.ok && parsed.data.success };
    }
  } catch {
    // A network interruption or an invalid response should leave the form editable.
  }
  return { success: false, message: "Không thể kết nối. Hãy thử lại.", field: undefined };
}
