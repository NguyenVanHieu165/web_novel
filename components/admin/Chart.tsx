"use client";

import { useEffect, useState } from "react";
import axiosClient from "@/lib/axios";

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
} from "recharts";

type ChartItem = {
  name: string;
  totalRevenue: number;
  billCount: number;

  newUserCount: number;

  newStoryCount: number;
  viewCount: number;
};

export default function Chart() {
  const [data, setData] = useState<ChartItem[]>([]);

  const [type, setType] = useState("revenue");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const res = await axiosClient.get("/statistics");

        console.log("API DATA:", res.data);

        setData(res.data.chartData || []);
      } catch (err: any) {
        console.error(err);

        setError(
          err.response?.data?.message || err.message || "Lỗi tải dữ liệu",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (error) {
    return (
      <div className="h-[400px] flex items-center justify-center text-red-500">
        ⚠️ {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        Đang tải dữ liệu...
      </div>
    );
  }

  return (
    <div className="w-full bg-white p-6 rounded-xl border border-gray-100">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold">Báo cáo hệ thống</h3>

          <p className="text-sm text-gray-500">Dashboard analytics</p>
        </div>

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-gray-200 px-3 py-2 rounded-lg"
        >
          <option value="revenue">Doanh thu</option>

          <option value="users">Người dùng</option>

          <option value="stories">Truyện</option>
        </select>
      </div>

      {/* CHART */}
      <div className="w-full h-[400px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="name" />

            <Tooltip />

            <Legend />

            {/* REVENUE */}
            {type === "revenue" && (
              <>
                {/* Trục doanh thu */}
                <YAxis
                  yAxisId="left"
                  tickFormatter={(value) => `${value / 1000}k`}
                />

                {/* Trục số đơn */}
                <YAxis yAxisId="right" orientation="right" />

                <Tooltip />

                <Legend />

                <Bar
                  yAxisId="left"
                  dataKey="totalRevenue"
                  name="Doanh thu"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="billCount"
                  name="Số đơn"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                />
              </>
            )}

            {/* USERS */}
            {type === "users" && (
              <>
                <YAxis />

                <Bar dataKey="newUserCount" name="User mới" fill="#10b981" />

                <Line
                  type="monotone"
                  dataKey="newUserCount"
                  stroke="#3b82f6"
                  strokeWidth={3}
                />
              </>
            )}

            {/* STORIES */}
            {type === "stories" && (
              <>
                <YAxis />
                <Bar dataKey="newStoryCount" name="Truyện mới" fill="#ec4899" />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
