import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'neutral' | 'outline' | 'accent';
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  onClick,
  className = '',
}) => {
  const baseClasses = 'inline-flex items-center font-medium rounded-full transition-colors whitespace-nowrap';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-0.5',
    md: 'text-xs px-3 py-1',
  };

  const variantClasses = {
    default: 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface border border-border',
    neutral: 'bg-surface-elevated text-text-secondary border border-border',
    outline: 'border border-border text-text-secondary hover:text-text-primary hover:border-accent',
    accent: 'bg-accent hover:bg-accent-hover text-white shadow-soft',
  };

  return (
    <span
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </span>
  );
};
