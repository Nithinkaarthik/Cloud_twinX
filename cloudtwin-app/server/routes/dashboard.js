import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { authMiddleware } from "./auth.js";

const router = express.Router();

function ensureDbConnected(res) {
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({ error: "Database unavailable. Check MongoDB Atlas credentials and network access." });
        return false;
    }
    return true;
}

router.get("/summary", authMiddleware, async (req, res) => {
    if (!ensureDbConnected(res)) return;

    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [totalUsers, newUsers7d, withCompanyCount, latestUsers] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
            User.countDocuments({ company: { $nin: [null, ""] } }),
            User.find({}, { fullName: 1, email: 1, company: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(5),
        ]);

        const withCompanyPct = totalUsers > 0 ? Math.round((withCompanyCount / totalUsers) * 100) : 0;

        res.json({
            totalUsers,
            newUsers7d,
            withCompanyPct,
            latestUsers,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to load dashboard summary", details: error.message });
    }
});

router.get("/signup-trend", authMiddleware, async (req, res) => {
    if (!ensureDbConnected(res)) return;

    try {
        const days = 7;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (days - 1));

        const raw = await User.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: {
                        y: { $year: "$createdAt" },
                        m: { $month: "$createdAt" },
                        d: { $dayOfMonth: "$createdAt" },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
        ]);

        const countByDay = new Map(
            raw.map((item) => {
                const key = `${item._id.y}-${String(item._id.m).padStart(2, "0")}-${String(item._id.d).padStart(2, "0")}`;
                return [key, item.count];
            })
        );

        const trend = Array.from({ length: days }, (_, idx) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + idx);

            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const dd = String(date.getDate()).padStart(2, "0");
            const key = `${yyyy}-${mm}-${dd}`;

            return {
                day: `${mm}/${dd}`,
                date: key,
                count: countByDay.get(key) || 0,
            };
        });

        res.json({ trend, generatedAt: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ error: "Failed to load signup trend", details: error.message });
    }
});

export default router;
