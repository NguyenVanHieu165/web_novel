
export type ApiError = {
    field?: string
    message?: string
    details?: any
}

export type ApiResponse<T> = {
    success: boolean
    code: string
    message?: string
    data?: T
    error?: ApiError
    meta?: any
    requestId?: string
    timestamp: string
}

// ======================
// REQUEST ID
// ======================
export const getRequestId = () => crypto.randomUUID()
export const resSuccess = <T>(
    data: T,
    options?: {
        code?: string
        message?: string
        meta?: any
        requestId?: string
    }
): ApiResponse<T> => {
    return {
        success: true,
        code: options?.code || "OK",
        ...(options?.message && { message: options.message }),
        data,
        ...(options?.meta && { meta: options.meta }),
        ...(options?.requestId && { requestId: options.requestId }),
        timestamp: new Date().toISOString()
    }
}

// ======================
// ERROR RESPONSE
// ======================
export const resError = (
    options?: {
        code?: string
        message?: string
        error?: ApiError
        requestId?: string
    }
): ApiResponse<null> => {
    return {
        success: false,
        code: options?.code || "ERROR",
        message: options?.message || "Lỗi",
        ...(options?.error && { error: options.error }),
        ...(options?.requestId && { requestId: options.requestId }),
        timestamp: new Date().toISOString()
    }
}

// ======================
// GLOBAL ERROR HANDLER
// ======================
export const handleError = (err: any, requestId?: string) => {
    console.error("API ERROR:", err)

    // Prisma duplicate
    if (err.code === "P2002") {
        return resError({
            code: "DUPLICATE",
            message: "Dữ liệu đã tồn tại",
            error: { field: err.meta?.target },
            requestId
        })
    }

    // Not found custom
    if (err.name === "NotFoundError") {
        return resError({
            code: "NOT_FOUND",
            message: "Không tìm thấy dữ liệu",
            requestId
        })
    }

    // Default
    return resError({
        code: "SERVER_ERROR",
        message: "Lỗi hệ thống",
        error: { details: err.message },
        requestId
    })
}

// ======================
// HELPER ACTION
// ======================
export const created = (id: number, requestId?: string) =>
    resSuccess(
        { id },
        { code: "CREATED", message: "Tạo thành công", requestId }
    )

export const updated = (id: number, requestId?: string) =>
    resSuccess(
        { id },
        { code: "UPDATED", message: "Cập nhật thành công", requestId }
    )

export const deleted = (id: number, requestId?: string) =>
    resSuccess(
        { id },
        { code: "DELETED", message: "Xóa thành công", requestId }
    )