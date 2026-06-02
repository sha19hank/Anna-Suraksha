'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Leaf, ScanLine, LayoutDashboard, Utensils, LogOut, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const NAV = [
  { href: '/dashboard',  label: 'Home',    icon: LayoutDashboard },
  { href: '/scan',       label: 'Scan',    icon: ScanLine        },
  { href: '/history',    label: 'History', icon: History         },
  { href: '/surplus',    label: 'Surplus', icon: Utensils        },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out');
    router.push('/auth/login');
  };

  return (
    <nav className="sticky top-0 z-50 w-full bg-cream/80 backdrop-blur-md border-b border-earth/8">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Wordmark */}
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-leaf rounded-lg flex items-center justify-center group-hover:bg-leaf-dark transition-colors">
            <Leaf className="w-4 h-4 text-cream" />
          </div>
          <span className="font-display font-bold text-earth text-base tracking-tight">Anna Suraksha</span>
        </Link>

        {/* Links */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-body transition-all',
                href === '/dashboard' ? pathname === href || pathname === '/' : pathname.startsWith(href)
                  ? 'bg-leaf/10 text-leaf font-medium'
                  : 'text-earth/60 hover:text-earth hover:bg-earth/5'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* User + logout */}
        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden sm:block text-xs text-earth/50 font-mono truncate max-w-[140px]">
              {user.signInDetails?.loginId ?? user.username}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-earth/40 hover:text-saffron hover:bg-saffron/8 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile bottom bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-cream/95 backdrop-blur-md border-t border-earth/8 flex z-50">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-body transition-all',
              href === '/dashboard' ? pathname === href || pathname === '/' : pathname.startsWith(href) ? 'text-leaf' : 'text-earth/40'
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
