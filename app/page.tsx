"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createGame, characters, type GameHandle } from "./game";

type Entry = {
  id: string;
  name: string;
  score: number;
  created_at: number;
  user_id?: string | null;
};

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<GameHandle | null>(null);
  const runId = useRef<string>("");

  // 游戏核心状态
  const [score, setScore] = useState(0);
  const [next, setNext] = useState(0);
  const [coins, setCoins] = useState(0);
  const [over, setOver] = useState(false);
  const [muted, setMuted] = useState(false);
  const [board, setBoard] = useState(false);

  // 排行榜与提交状态
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("小奶宝");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // 改名表单状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [submittedName, setSubmittedName] = useState("");

  const loadBoard = useCallback(async () => {
    setMessage("正在读取排行榜…");
    try {
      const res = await fetch("/api/scores");
      const data = (await res.json()) as { scores?: Entry[]; error?: string };
      if (!res.ok || !data.scores) throw new Error(data.error || "加载失败");
      setEntries(data.scores);
      setMessage("");
    } catch {
      setMessage("排行榜暂时未能连接，请稍后重试。");
    }
  }, []);

  async function renameScore(id: string, newName: string) {
    const cleanName = newName.trim();
    if (!cleanName || cleanName.length > 12) {
      setMessage("昵称须为 1–12 个字符。");
      return;
    }
    if (renameBusy) return;

    setRenameBusy(true);
    setMessage("正在修改昵称…");
    try {
      const res = await fetch("/api/scores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: cleanName }),
      });
      const data = (await res.json()) as { error?: string; updated?: { id: string; name: string } };
      if (!res.ok || !data.updated) {
        throw new Error(data.error || "修改失败，请重试。");
      }

      setEntries((current) =>
        current.map((item) => (item.id === id ? { ...item, name: cleanName } : item))
      );

      if (id === runId.current || id === lastSavedId) {
        setName(cleanName);
        setSubmittedName(cleanName);
        try {
          localStorage.setItem("naibao.nickname", cleanName);
        } catch {}
      }

      setEditingId(null);
      setMessage("昵称已修改，成绩和排名不变。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改失败，请重试。");
    } finally {
      setRenameBusy(false);
    }
  }

  function reset() {
    game.current?.reset();
    runId.current = crypto.randomUUID();
    setSaved(false);
    setSubmittedName("");
    setMessage("");
  }

  function toggleSound() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    game.current?.setMuted(nextMuted);
    try {
      localStorage.setItem("naibao.muted", nextMuted ? "1" : "0");
    } catch {}
  }

  async function saveScore() {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("先给奶宝取个昵称吧。");
      return;
    }
    setBusy(true);
    setMessage("正在保存成绩…");
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: runId.current,
          name: trimmed,
          score,
        }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setLastSavedId(runId.current);
      setSubmittedName(trimmed);
      try {
        localStorage.setItem("naibao.nickname", trimmed);
      } catch {}
      await loadBoard();
      setMessage("成绩已保存，下一局继续加油！");
    } catch {
      setMessage("保存失败，成绩还在，可以再次提交。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!canvas.current) return;

    const instance = createGame(canvas.current, (s) => {
      setScore(s.score);
      setNext(s.next);
      setCoins(s.coins);
      setOver(s.over);
    });
    game.current = instance;
    runId.current = crypto.randomUUID();

    try {
      const savedNickname = localStorage.getItem("naibao.nickname");
      if (savedNickname) setName(savedNickname);
      const isMuted = localStorage.getItem("naibao.muted") === "1";
      setMuted(isMuted);
      instance.setMuted(isMuted);
    } catch {}

    void loadBoard();

    return () => {
      instance.destroy();
      game.current = null;
    };
  }, [loadBoard]);

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="奶宝碰碰乐首页">
          <span className="brand-icon">🍼</span> 奶宝碰碰乐
        </a>
        <span className="edition">MILK BABY CLUB · 01</span>
        <button
          className="small-button"
          onClick={() => {
            setBoard(true);
            void loadBoard();
          }}
        >
          🏆 排行榜
        </button>
      </header>

      <div className="workspace">
        <aside className="intro">
          <span className="eyebrow">碰一下，长大一点</span>
          <h1>
            小奶宝，
            <br />
            大快乐<span>。</span>
          </h1>
          <p className="intro-copy">
            把两只相同的小家伙碰在一起，
            <br />
            看看你能养出多大的奶宝。
          </p>
          <div className="goal">
            <img src="/characters/1F438.svg" alt="神奶蛙" />
            <div>
              <span>今天的小目标</span>
              <strong>合出一只神奶蛙</strong>
            </div>
          </div>
          {[
            ["01", "瞄准空位", "移动鼠标，或用手指拖动。"],
            ["02", "轻轻投放", "点击，或松开手指。"],
            ["03", "让相同的相遇", "碰在一起，就会升级。"],
          ].map(([n, t, d]) => (
            <div className="instruction" key={n}>
              <span className="step-number">{n}</span>
              <p>
                <strong>{t}</strong>
                <br />
                {d}
              </p>
            </div>
          ))}
          <p className="keyboard">键盘也能玩：← → 瞄准 · 空格投放</p>
        </aside>

        <section className="play-column" aria-label="奶宝合成游戏">
          <div className="game-top">
            <div>
              <span>本局得分</span>
              <strong>{score.toLocaleString()}</strong>
            </div>
            <div className="next">
              <span>下一只</span>
              <img src={characters[next].src} alt={characters[next].name} />
            </div>
            <div className="coin">
              <span>复活币</span>
              <strong>🪙 {coins}</strong>
            </div>
          </div>

          <div className="arena">
            <canvas
              ref={canvas}
              tabIndex={0}
              aria-label="投放区域：左右方向键瞄准，空格投放，相同奶宝会合成"
            />
            {over && (
              <div className="game-overlay">
                <div className="end-card">
                  <span className="end-icon">🍼</span>
                  <h2>奶宝装满啦！</h2>
                  <p>
                    这次收获了 <strong>{score}</strong> 分
                  </p>
                  {coins > 0 && !saved && (
                    <button
                      className="primary"
                      onClick={() => {
                        game.current?.revive();
                        setMessage("");
                      }}
                    >
                      用一枚复活币，继续玩
                    </button>
                  )}
                  <label htmlFor="nickname">给这份成绩签个名</label>
                  <input
                    id="nickname"
                    maxLength={12}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy || renameBusy}
                  />
                  <button
                    disabled={busy || renameBusy || (saved && name.trim() === submittedName)}
                    onClick={() => (saved ? renameScore(runId.current, name) : saveScore())}
                  >
                    {renameBusy
                      ? "修改中…"
                      : saved
                      ? name.trim() === submittedName
                        ? "✓ 成绩已保存"
                        : "保存新昵称"
                      : busy
                      ? "保存中…"
                      : "保存到排行榜"}
                  </button>
                  <p className="status" role="status">
                    {message}
                  </p>
                  <button className="primary" onClick={reset}>
                    再养一局
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="game-bottom">
            <span>别让奶宝停留在虚线上方哦</span>
            <button aria-pressed={!muted} onClick={toggleSound}>
              {muted ? "音效关" : "音效开"}
            </button>
            <button
              onClick={() => {
                if (score === 0 || window.confirm("要结束这一局，重新开始吗？")) {
                  reset();
                }
              }}
            >
              ↻ 重开
            </button>
          </div>
        </section>

        <aside className="collection">
          <div className="collection-title">
            <span className="eyebrow">成长图鉴</span>
            <span>10 位小伙伴</span>
          </div>
          <h2>从一瓶奶开始。</h2>
          <div className="character-list">
            {characters.map((c, i) => (
              <div className="character-row" key={c.name}>
                <span className="level">{String(i + 1).padStart(2, "0")}</span>
                <img src={c.src} alt="" />
                <span>{c.name}</span>
                {i === 9 && <span className="max-tag">MAX</span>}
              </div>
            ))}
          </div>
          <div className="bonus-note">
            <strong>一碰就有小惊喜</strong>
            <p>每 2000 分获得一枚复活币。两只神奶蛙相遇，清场加 500 分，再送一枚复活币。</p>
          </div>
        </aside>
      </div>

      <footer>
        <span>一点点碰撞，一点点长大。</span>
        <span>
          素材：
          <a href="https://openmoji.org/" target="_blank" rel="noreferrer">
            OpenMoji
          </a>{" "}
          ·{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
        </span>
      </footer>

      {board && (
        <div className="modal-backdrop" onClick={() => setBoard(false)}>
          <section
            className="leaderboard"
            role="dialog"
            aria-modal="true"
            aria-label="奶宝排行榜"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBoard(false);
            }}
          >
            <header>
              <div>
                <span className="eyebrow">MILK BABY CLUB</span>
                <h2>奶宝高手榜</h2>
              </div>
              <button autoFocus onClick={() => setBoard(false)} aria-label="关闭排行榜">
                ✕
              </button>
            </header>
            <p>全服前 20 名高分榜</p>
            <div className="ranking">
              {entries.length === 0 && !message && (
                <p>还没有成绩，来做第一位奶宝高手吧。</p>
              )}
              {entries.map((e, i) => {
                const canEdit = e.id === runId.current || e.id === lastSavedId;
                return (
                  <div className="rank-row" key={e.id}>
                    <span>{i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1).padStart(2, "0")}</span>
                    <div className="rank-name">
                      {editingId === e.id ? (
                        <form
                          className="rename-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void renameScore(e.id, draftName);
                          }}
                        >
                          <input
                            autoFocus
                            aria-label="新的排行榜昵称"
                            maxLength={12}
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            disabled={renameBusy}
                          />
                          <div>
                            <button type="submit" disabled={renameBusy}>
                              {renameBusy ? "保存中…" : "保存"}
                            </button>
                            <button
                              type="button"
                              disabled={renameBusy}
                              onClick={() => {
                                setEditingId(null);
                                setMessage("");
                              }}
                            >
                              取消
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <strong>{e.name}</strong>
                          {canEdit && (
                            <button
                              className="rename-link"
                              aria-label={`修改${e.name}的昵称`}
                              disabled={renameBusy}
                              onClick={() => {
                                setEditingId(e.id);
                                setDraftName(e.name);
                                setMessage("");
                              }}
                            >
                              改名
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <b>
                      {e.score.toLocaleString()}
                      <small>分</small>
                    </b>
                  </div>
                );
              })}
            </div>
            <p className="status" role="status">
              {message}
            </p>
            <button onClick={loadBoard}>刷新排行榜</button>
            <button onClick={() => setBoard(false)}>回去继续玩</button>
          </section>
        </div>
      )}
    </main>
  );
}
