import axios from "axios";

const axiosClient = axios.create({
    baseURL:
        process.env.NEXT_PUBLIC_API_URL ||
        "/api",
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 10000,
});

/**
 * RESPONSE INTERCEPTOR (giữ nguyên response gốc)
 * => tránh lỗi response.data undefined
 */
axiosClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        // Filter changes and React effect cleanup intentionally cancel requests.
        if (axios.isCancel(error)) return Promise.reject(error);

        // log lỗi rõ hơn để debug backend
        if (axios.isAxiosError(error)) {
            console.error("Axios Error:", {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                data: error.response?.data,
            });
        } else {
            console.error("Axios Error:", error instanceof Error ? error.message : "Unknown request error");
        }

        return Promise.reject(error);
    }
);

/**
 * REQUEST INTERCEPTOR (optional - sau này dùng auth)
 */
axiosClient.interceptors.request.use(
    (config) => {

        return config;
    },
    (error) => Promise.reject(error)
);

export default axiosClient;
