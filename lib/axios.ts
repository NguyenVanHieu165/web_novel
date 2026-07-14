import axios from "axios";

const axiosClient = axios.create({
    baseURL:
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:3000/api",
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
    (error) => {
        // log lỗi rõ hơn để debug backend
        console.error("Axios Error:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
        });

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