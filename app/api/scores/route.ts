import { env } from "cloudflare:workers";

function db() {
  if (!env.DB) throw new Error("DB binding unavailable");
  return env.DB;
}

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "无法从其他网站修改昵称" }, { status: 403 });
  }

  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) {
    return Response.json({ error: "请登录后修改昵称" }, { status: 401 });
  }

  let data: unknown;
  try {
    const body = await request.text();
    if (body.length > 1000) return Response.json({ error: "内容过长" }, { status: 413 });
    data = JSON.parse(body);
  } catch {
    return Response.json({ error: "昵称格式不正确" }, { status: 400 });
  }

  if (!data || typeof data !== "object") {
    return Response.json({ error: "昵称格式不正确" }, { status: 400 });
  }

  const { id, name } = data as { id?: unknown; name?: unknown };
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    return Response.json({ error: "成绩不存在" }, { status: 400 });
  }

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 12 ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    return Response.json({ error: "昵称须为 1–12 个字符" }, { status: 400 });
  }

  try {
    const updated = await db()
      .prepare(
        "UPDATE scores SET name = ? WHERE id = ? AND (user_id IS NULL OR user_id = ?) RETURNING id, name"
      )
      .bind(name.trim(), id, userId)
      .all();

    if (!updated.results.length) {
      return Response.json({ error: "该成绩不存在或您无权修改他人的成绩" }, { status: 403 });
    }

    return Response.json(
      { updated: updated.results[0] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Leaderboard rename failed", error);
    return Response.json({ error: "修改失败，请重试" }, { status: 503 });
  }
}

export async function GET() {
  try {
    const result = await db()
      .prepare(
        "SELECT id, name, score, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT 20"
      )
      .all();

    return Response.json(
      { scores: result.results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Leaderboard load failed", error);
    return Response.json({ error: "排行榜暂时不可用" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  let data: unknown;
  try {
    const body = await request.text();
    if (body.length > 1000) return Response.json({ error: "Too large" }, { status: 413 });
    data = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!data || typeof data !== "object") {
    return Response.json({ error: "Invalid score" }, { status: 400 });
  }

  const { id, name, score } = data as {
    id: unknown;
    name: unknown;
    score: unknown;
  };

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 12 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    typeof score !== "number" ||
    !Number.isSafeInteger(score) ||
    score < 0 ||
    score > 1000000
  ) {
    return Response.json({ error: "Invalid score" }, { status: 400 });
  }

  const userId = request.headers.get("oai-authenticated-user-id") || null;

  try {
    await db()
      .prepare(
        "INSERT INTO scores (id, name, score, created_at, user_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING"
      )
      .bind(id, name.trim(), score, Date.now(), userId)
      .run();

    return Response.json({ saved: true });
  } catch (error) {
    console.error("Leaderboard save failed", error);
    return Response.json({ error: "成绩保存失败，请重试" }, { status: 503 });
  }
}
