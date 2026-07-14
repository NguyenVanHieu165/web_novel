import axiosClient from "@/lib/axios";
import { GenresFormValues } from "@/schemas/genres_schema";
export const getGenres = async (params?: {
    page?: number;
    limit?: number;
    search?: string;
}) => {
    const res = await axiosClient.get("/app/admin/genres", {
        params,
    });
    return res.data;
};
export const createGenre = async (data: GenresFormValues) => {
    const res = await axiosClient.post("/app/admin/genres", data);
    return res.data;
};
