
export type ApiError = {
    field?: string | string[]
    message?: string
    details?: unknown
}

export type ApiResponse<T> = {
    success: boolean
    code: string
    message?: string
    data?: T
    error?: ApiError
    meta?: unknown
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
        meta?: unknown
        requestId?: string
    }
): ApiResponse<T> => {
    return {
        success: true,
        code: options?.code || "OK",
        ...(options?.message && { message: options.message }),
        data,
        ...(options?.meta ? { meta: options.meta } : {}),
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
export const handleError = (err: unknown, requestId?: string) => {
    console.error("API ERROR:", err)
    const error = typeof err === "object" && err !== null ? err : undefined

    // Prisma duplicate
    if (error && "code" in error && error.code === "P2002") {
        const meta = "meta" in error ? error.meta : undefined
        const target = typeof meta === "object" && meta !== null && "target" in meta
            ? meta.target
            : undefined
        const field = typeof target === "string" ||
            (Array.isArray(target) && target.every((part: unknown) => typeof part === "string"))
            ? target
            : undefined
        return resError({
            code: "DUPLICATE",
            message: "Dữ liệu đã tồn tại",
            error: { field },
            requestId
        })
    }

    // Not found custom
    if (error && "name" in error && error.name === "NotFoundError") {
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
        error: { details: error && "message" in error ? error.message : undefined },
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