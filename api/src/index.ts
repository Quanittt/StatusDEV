import cors from "cors";
import express from "express";
import { z } from "zod";
import { prisma } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const setStatusSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  value: z.enum(["working", "meeting", "break", "offline"]),
  note: z.string().optional(),
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/status", async (_req, res) => {
  const statuses = await prisma.status.findMany({
    orderBy: { updatedAt: "desc" },
  });
  res.json(statuses);
});

app.post("/status", async (req, res) => {
  const parsed = setStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { userId, userName, value, note } = parsed.data;
  const status = await prisma.status.upsert({
    where: { userId },
    create: { userId, userName, value, note },
    update: { userName, value, note },
  });

  res.json(status);
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
