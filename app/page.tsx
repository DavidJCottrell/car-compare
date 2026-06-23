'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CarWithDetails } from '@/lib/types';
import { CarCard } from '@/components/CarCard';
import { calcMetrics, MONTHLY_BUDGET } from '@/lib/calculations';

export default function DashboardPage() {
  const router = useRouter();
  const [cars, setCars] = useState<CarWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(MONTHLY_BUDGET);

  // Sort cars by lowest to highest total monthly cost.
  const sortedCars = useMemo(
    () =>
      [...cars].sort(
        (a, b) => calcMetrics(a).total_monthly_cost - calcMetrics(b).total_monthly_cost
      ),
    [cars]
  );

  const fetchCars = useCallback(async () => {
    try {
      const res = await fetch('/api/cars');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCars(data);
    } catch {
      setError('Could not load your garage. Make sure the database is set up — visit /api/setup once after deployment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCars(); }, [fetchCars]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this car from your garage?')) return;
    await fetch(`/api/cars/${id}`, { method: 'DELETE' });
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    fetchCars();
  };

  const handleCompare = () => {
    const ids = Array.from(selectedIds).join(',');
    router.push(`/compare?ids=${ids}`);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">My Garage</h1>
          <p className="text-gray-400 mt-1">
            {cars.length > 0
              ? `${cars.length} car${cars.length !== 1 ? 's' : ''} · Select at least 2 to compare`
              : 'Add your first car to get started'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {cars.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
              <label htmlFor="monthly-budget" className="text-sm text-gray-400 whitespace-nowrap">
                Max monthly budget
              </label>
              <span className="text-gray-500">£</span>
              <input
                id="monthly-budget"
                type="number"
                min={0}
                step={50}
                value={monthlyBudget}
                onChange={e => setMonthlyBudget(Number(e.target.value) || 0)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              {monthlyBudget !== MONTHLY_BUDGET && (
                <button
                  onClick={() => setMonthlyBudget(MONTHLY_BUDGET)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap"
                  title={`Reset to default (£${MONTHLY_BUDGET})`}
                >
                  Reset
                </button>
              )}
            </div>
          )}
          {selectedIds.size >= 2 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-72 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && cars.length === 0 && (
        <div className="text-center py-24">
          <div className="text-6xl mb-4">🚗</div>
          <h2 className="text-xl font-semibold text-white mb-2">Your garage is empty</h2>
          <p className="text-gray-400 mb-6">Add your first car to start comparing ownership costs.</p>
          <button
            onClick={() => router.push('/cars/new')}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
          >
            Add Your First Car
          </button>
        </div>
      )}

      {/* Car grid */}
      {!loading && cars.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedCars.map(data => (
            <CarCard
              key={data.car.id}
              data={data}
              selected={selectedIds.has(data.car.id)}
              onToggleSelect={toggleSelect}
              onDelete={handleDelete}
              monthlyBudget={monthlyBudget}
            />
          ))}
        </div>
      )}

      {/* Sticky compare bar */}
      {selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl px-6 py-3 flex items-center gap-4 shadow-2xl">
            <span className="text-gray-300 text-sm font-medium">
              {selectedIds.size} cars selected
            </span>
            <button
              onClick={handleCompare}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2 rounded-xl transition-colors text-sm shadow-lg shadow-blue-600/30"
            >
              Compare →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
