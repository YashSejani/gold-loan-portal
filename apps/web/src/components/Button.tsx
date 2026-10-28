import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'link';

const VARIANTS: Record<Variant, string> = {
  primary:
    'h-12 rounded-lg bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500',
  secondary:
    'h-12 rounded-lg border border-slate-300 bg-white px-5 font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400',
  link: 'min-h-11 min-w-11 rounded-md px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
