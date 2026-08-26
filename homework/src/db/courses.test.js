import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listCourses,
  createCourse,
  renameCourse,
  setCourseColor,
  archiveCourse,
} from "@/db/courses";

const { select, execute, load } = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));

beforeEach(() => {
  load.mockResolvedValue({ select, execute });
  select.mockResolvedValue([]);
  execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
});

const lastSql = (spy) => spy.mock.calls.at(-1)[0];
const lastValues = (spy) => spy.mock.calls.at(-1)[1];

describe("listCourses", () => {
  it("returns the rows the database gives back, untouched", async () => {
    const rows = [
      { id: 1, name: "Zoologie", archived_at: null, created_at: "2026-08-21T09:14:03Z" },
      { id: 2, name: "Éducation physique", archived_at: null, created_at: "2026-08-22T09:14:03Z" },
    ];
    select.mockResolvedValue(rows);

    expect(await listCourses()).toBe(rows);
  });

  it("reads every column a course has", async () => {
    await listCourses();

    for (const column of ["id", "name", "color", "archived_at", "created_at"]) {
      expect(lastSql(select)).toContain(column);
    }
  });

  // SQL compares bytes, which would put `Éducation physique` after `Zoologie`.
  // Course ordering is `localeCompare` in JavaScript and belongs nowhere near
  // this layer.
  it("never orders courses by name", async () => {
    await listCourses();

    expect(lastSql(select)).not.toMatch(/order\s+by[^;]*\bname\b/i);
  });
});

describe("createCourse", () => {
  it("inserts an active course and returns its new id", async () => {
    execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 7 });

    const id = await createCourse("Zoologie", "#ef4444", "2026-08-21T09:14:03Z");

    expect(id).toBe(7);
    expect(lastValues(execute)).toEqual(["Zoologie", "#ef4444", "2026-08-21T09:14:03Z"]);
    expect(lastSql(execute)).toMatch(/insert\s+into\s+courses/i);
  });

  it("leaves archived_at null so the course counts as active", async () => {
    await createCourse("Zoologie", "#ef4444", "2026-08-21T09:14:03Z");

    expect(lastSql(execute)).toMatch(/null/i);
  });
});

describe("renameCourse", () => {
  // Renaming updates the single course row, so every entry follows at once:
  // names are never copied onto homework.
  it("updates the name of one course", async () => {
    await renameCourse(7, "Zoologie appliquée");

    expect(lastSql(execute)).toMatch(/update\s+courses\s+set\s+name/i);
    expect(lastValues(execute)).toEqual(["Zoologie appliquée", 7]);
  });
});

describe("setCourseColor", () => {
  it("updates the color of one course", async () => {
    await setCourseColor(7, "#3b82f6");

    expect(lastSql(execute)).toMatch(/update\s+courses\s+set\s+color/i);
    expect(lastValues(execute)).toEqual(["#3b82f6", 7]);
  });
});

describe("archiveCourse", () => {
  it("soft-deletes by stamping archived_at", async () => {
    await archiveCourse(7, "2026-08-23T17:00:00Z");

    expect(lastSql(execute)).toMatch(/update\s+courses\s+set\s+archived_at/i);
    expect(lastValues(execute)).toEqual(["2026-08-23T17:00:00Z", 7]);
  });
});

describe("the courses module as a whole", () => {
  // Invariant 2: a course is never removed, only archived. A `DELETE FROM
  // courses` would break the foreign key and orphan the name a student still
  // sees on old entries.
  it("issues no DELETE against courses", async () => {
    await listCourses();
    await createCourse("Zoologie", "#ef4444", "2026-08-21T09:14:03Z");
    await renameCourse(7, "Zoologie appliquée");
    await setCourseColor(7, "#3b82f6");
    await archiveCourse(7, "2026-08-23T17:00:00Z");

    const everySql = [...select.mock.calls, ...execute.mock.calls].map(
      (call) => call[0],
    );

    for (const sql of everySql) {
      expect(sql).not.toMatch(/\bdelete\b/i);
    }
  });
});
