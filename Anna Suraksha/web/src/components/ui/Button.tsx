import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

const variants = {
  primary:   'bg-leaf text-cream hover:bg-leaf-dark active:scale-[0.98] shadow-sm',
  secondary: 'bg-cream-dark text-earth hover:bg-[#DDD5C5] border border-earth/10',
  ghost:     'text-leaf hover:bg-leaf/8',
  danger:    'bg-saffron text-white hover:bg-saffron-dark active:scale-[0.98]',
};
const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...rest }: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-display font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-leaf focus-visible:outline-offset-2',
        variants[variant], sizes[size], className
      )}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
