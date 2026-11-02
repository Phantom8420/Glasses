"use client";

import { useState } from "react";
import { useData } from "../DataProvider";
import { Select } from "../Select";
import {
  addExam,
  addExamTopic,
  deleteExam,
  deleteExamTopic,
  getCourses,
  setTopicConfidence,
  type Confidence,
  type Exam,
} from "@/lib/store";
import { formatLongDate, fromISODate, todayISO } from "@/lib/time";
import { btn, cx, Card } from "../ui";

const LEVELS = [
  { label: "unrated", cls: "text-text-secondary border-border" },
  { label: "shaky", cls: "text-red-neon border-red-neon" },
  { label: "okay", cls: "text-text-primary border-text-secondary" },
  { label: "solid", cls: "text-green border-green" },
];

function daysUntil(date: string): number {
  return Math.round(
    (fromISODate(date).getTime() - fromISODate(todayISO()).getTime()) / 86400000,
  );
}

export function ExamsPanel() {
  const { db, mutate } = useData();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const courses = getCourses(db);

  const submit = () => {
    if (!title.trim() || !date) return;
    const payload = {
      title,
      date,
      courseId: courseId ? Number(courseId) : null,
    };
    setTitle("");
    setDate("");
    setCourseId("");
    mutate((d) => addExam(d, payload));
  };

  const sorted = [...db.exams].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((e) => daysUntil(e.date) >= 0);
  const past = sorted.filter((e) => daysUntil(e.date) < 0).reverse();

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="New exam, e.g. Calculus midterm"
          className="w-full text-sm"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Exam date"
            className="min-w-0 flex-1 text-sm"
          />
          {courses.length > 0 && (
            <div className="min-w-0 flex-1">
              <Select
                value={courseId}
                onChange={setCourseId}
                placeholder="Course"
                ariaLabel="Course"
                options={courses.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                  color: c.color,
                }))}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || !date}
          className={cx(btn.base, btn.primary)}
        >
          Add exam
        </button>
      </Card>

      {upcoming.length === 0 && past.length === 0 && (
        <p className="px-1 py-10 text-center text-sm text-text-secondary">
          No exams yet. Add one above to start the countdown.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {upcoming.map((e) => (
          <ExamCard key={e.id} exam={e} />
        ))}
      </div>

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-text-secondary">Past</h3>
          {past.map((e) => (
            <ExamCard key={e.id} exam={e} past />
          ))}
        </section>
      )}
    </div>
  );
}

function ExamCard({ exam, past = false }: { exam: Exam; past?: boolean }) {
  const { db, mutate } = useData();
  const [topic, setTopic] = useState("");
  const days = daysUntil(exam.date);
  const course = getCourses(db).find((c) => c.id === exam.course_id);
  const left = exam.topics.filter((t) => t.confidence < 3).length;
  const topics = [...exam.topics].sort((a, b) => a.confidence - b.confidence);

  const addTopic = () => {
    if (!topic.trim()) return;
    const name = topic;
    setTopic("");
    mutate((d) => addExamTopic(d, exam.id, name));
  };

  return (
    <Card className={cx("flex flex-col gap-3 p-4", past && "opacity-60")}>
      <div className="flex items-start gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center">
          {past ? (
            <span className="font-mono text-sm text-text-secondary">done</span>
          ) : days === 0 ? (
            <span className="font-mono text-lg font-semibold text-red-neon">today</span>
          ) : (
            <>
              <span
                className={cx(
                  "font-mono text-3xl font-semibold leading-none",
                  days <= 3 ? "text-red-neon" : "text-text-primary",
                )}
              >
                {days}
              </span>
              <span className="mt-1 text-[11px] text-text-secondary">
                {days === 1 ? "day left" : "days left"}
              </span>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{exam.title}</p>
          <p className="font-mono text-xs text-text-secondary">
            {formatLongDate(exam.date)}
          </p>
          {course && (
            <span
              className="mt-1 inline-block text-xs text-text-secondary"
              style={{ borderLeft: `2px solid ${course.color}`, paddingLeft: 6 }}
            >
              {course.name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => mutate((d) => deleteExam(d, exam.id))}
          aria-label={`Delete ${exam.title}`}
          className="shrink-0 px-1 text-lg leading-none text-text-secondary hover:text-red-neon"
        >
          ×
        </button>
      </div>

      {!past && exam.topics.length > 0 && (
        <p className="text-xs text-text-secondary">
          {left === 0
            ? "Every topic is solid."
            : days > 0
              ? `${left} topic${left === 1 ? "" : "s"} to firm up, about ${(left / days).toFixed(1)} a day.`
              : `${left} topic${left === 1 ? "" : "s"} still not solid.`}
        </p>
      )}

      {topics.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {topics.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  mutate((d) =>
                    setTopicConfidence(d, exam.id, t.id, ((t.confidence + 1) % 4) as Confidence),
                  )
                }
                className={cx(
                  "w-16 shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium",
                  LEVELS[t.confidence].cls,
                )}
              >
                {LEVELS[t.confidence].label}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {t.name}
              </span>
              <button
                type="button"
                onClick={() => mutate((d) => deleteExamTopic(d, exam.id, t.id))}
                aria-label={`Remove ${t.name}`}
                className="px-1 text-text-secondary hover:text-red-neon"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!past && (
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTopic()}
          placeholder="Add a topic to revise…"
          className="w-full text-sm"
        />
      )}
    </Card>
  );
}
