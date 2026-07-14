import { prisma } from "@/lib/prisma";

export const getFullStatistics = async (
    month: number,
    year: number
) => {
    const startDate = new Date(year, month - 1, 1);

    const endDate = new Date(
        year,
        month,
        0,
        23,
        59,
        59
    );

    const [revenue, newUsers, newStories, topStories] =
        await Promise.all([
            prisma.hoaDonNap.aggregate({
                where: {
                    trang_thai: "success",
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },

                _sum: {
                    soTienVnd: true,
                    so_xu_nap: true,
                },

                _count: true,
            }),

            prisma.taiKhoan.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },

                    isDeleted: false,
                },
            }),

            prisma.truyen.count({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
            }),

            prisma.truyen.findMany({
                take: 5,

                orderBy: {
                    luotXem: "desc",
                },

                select: {
                    tenTruyen: true,
                    luotXem: true,
                },
            }),
        ]);

    return {
        finance: revenue,
        userCount: newUsers,
        storyCount: newStories,
        ranking: topStories,
    };
};