import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DerivedTask, Metrics, Task, TaskInput } from '@/types';

import {
  computeAverageROI,
  computePerformanceGrade,
  computeRevenuePerHour,
  computeTimeEfficiency,
  computeTotalRevenue,
  withDerived,
  sortTasks as sortDerived,
} from '@/utils/logic';
import { generateSalesTasks } from '@/utils/seed';

interface UseTasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  derivedSorted: DerivedTask[];
  metrics: Metrics;
  lastDeleted: Task | null;
  addTask: (task: TaskInput) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  undoDelete: () => void;
  clearLastDeleted: () => void;
}

const INITIAL_METRICS: Metrics = {
  totalRevenue: 0,
  totalTimeTaken: 0,
  timeEfficiencyPct: 0,
  revenuePerHour: 0,
  averageROI: 0,
  performanceGrade: 'Needs Improvement',
};

export function useTasks(): UseTasksState {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);
  const fetchedRef = useRef(false);

  function normalizeTasks(input: any[]): Task[] {
    const now = Date.now();

    return (Array.isArray(input) ? input : [])
      .map((t, idx) => {
        const created = t.createdAt
          ? new Date(t.createdAt)
          : new Date(now - (idx + 1) * 24 * 3600 * 1000);

        const completed =
          t.completedAt ||
          (t.status === 'Done'
            ? new Date(created.getTime() + 24 * 3600 * 1000).toISOString()
            : undefined);

        return {
          id:
            typeof t.id === 'string' && t.id.trim() !== ''
              ? t.id
              : crypto.randomUUID(),
          title:
            typeof t.title === 'string' && t.title.trim() !== ''
              ? t.title
              : 'Untitled Task',
          revenue: Number.isFinite(Number(t.revenue)) ? Number(t.revenue) : 0,
          timeTaken: Number(t.timeTaken) > 0 ? Number(t.timeTaken) : 1,
          priority: t.priority ?? 'Medium',
          status: t.status ?? 'Todo',
          notes: t.notes,
          createdAt: created.toISOString(),
          completedAt: completed,
        } as Task;
      })
      .filter(t => t.title !== '');
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const res = await fetch('/tasks.json');
        if (!res.ok) throw new Error(`Failed to load tasks.json (${res.status})`);

        const data = (await res.json()) as any[];
        const normalized = normalizeTasks(data);
        const finalData =
          normalized.length > 0 ? normalized : generateSalesTasks(50);

        if (isMounted) setTasks(finalData);
      } catch (e: any) {
        if (isMounted) setError(e?.message ?? 'Failed to load tasks');
      } finally {
        if (isMounted) {
          setLoading(false);
          fetchedRef.current = true;
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const derivedSorted = useMemo<DerivedTask[]>(() => {
    const withRoi = tasks.map(withDerived);
    return sortDerived(withRoi);
  }, [tasks]);

  const metrics = useMemo<Metrics>(() => {
    if (tasks.length === 0) return INITIAL_METRICS;

    const totalRevenue = computeTotalRevenue(tasks);
    const totalTimeTaken = tasks.reduce((s, t) => s + t.timeTaken, 0);
    const timeEfficiencyPct = computeTimeEfficiency(tasks);
    const revenuePerHour = computeRevenuePerHour(tasks);
    const averageROI = computeAverageROI(tasks);
    const performanceGrade = computePerformanceGrade(averageROI);

    return {
      totalRevenue,
      totalTimeTaken,
      timeEfficiencyPct,
      revenuePerHour,
      averageROI,
      performanceGrade,
    };
  }, [tasks]);

  // ✅ FIXED: uses TaskInput
  const addTask = useCallback((task: TaskInput) => {
    setTasks(prev => {
      const id = task.id ?? crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const completedAt = task.status === 'Done' ? createdAt : undefined;

      return [
        ...prev,
        {
          ...task,
          id,
          createdAt,
          completedAt,
          timeTaken: task.timeTaken <= 0 ? 1 : task.timeTaken,
        },
      ];
    });
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...patch };

        if (t.status !== 'Done' && updated.status === 'Done') {
          updated.completedAt = new Date().toISOString();
        }

        if (updated.timeTaken <= 0) updated.timeTaken = 1;
        return updated;
      })
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id) || null;
      setLastDeleted(target);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const undoDelete = useCallback(() => {
    if (!lastDeleted) return;
    setTasks(prev => [...prev, lastDeleted]);
    setLastDeleted(null);
  }, [lastDeleted]);

  const clearLastDeleted = useCallback(() => {
    setLastDeleted(null);
  }, []);

  return {
    tasks,
    loading,
    error,
    derivedSorted,
    metrics,
    lastDeleted,
    addTask,
    updateTask,
    deleteTask,
    undoDelete,
    clearLastDeleted,
  };
}
