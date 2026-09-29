import { useEffect, useState } from "react";
import type { Status, StatusValue } from "@statusdev/shared";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const STATUS_OPTIONS: StatusValue[] = ["working", "meeting", "break", "offline"];

function App() {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [userName, setUserName] = useState("");
  const [value, setValue] = useState<StatusValue>("working");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const loadStatuses = async () => {
    const res = await fetch(`${API_URL}/status`);
    setStatuses(await res.json());
  };

  useEffect(() => {
    loadStatuses();
  }, []);

  const submitStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;

    setLoading(true);
    try {
      await fetch(`${API_URL}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userName.trim().toLowerCase(),
          userName: userName.trim(),
          value,
          note: note.trim() || undefined,
        }),
      });
      setNote("");
      await loadStatuses();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>StatusDEV</h1>

      <form onSubmit={submitStatus} className="status-form">
        <input
          placeholder="Твоє ім'я"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
        <select value={value} onChange={(e) => setValue(e.target.value as StatusValue)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <input
          placeholder="Нотатка (необов'язково)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          Оновити статус
        </button>
      </form>

      <ul className="status-list">
        {statuses.map((s) => (
          <li key={s.id}>
            <strong>{s.userName}</strong> — {s.value}
            {s.note ? ` (${s.note})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
