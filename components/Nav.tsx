'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-base font-bold group-hover:bg-blue-500 transition-colors">
            D
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Driveline</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors ${
              pathname === '/' ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Garage
          </Link>
          <Link
            href="/cars/new"
            className={`text-sm font-medium transition-colors px-4 py-2 rounded-lg ${
              pathname === '/cars/new'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            + Add Car
          </Link>
        </div>
      </div>
    </nav>
  );
}
