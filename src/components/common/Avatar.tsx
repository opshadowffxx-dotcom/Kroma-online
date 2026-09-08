import React from 'react';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
  '2xl': 'w-24 h-24 text-2xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = 'User',
  size = 'md',
  className = '',
  onClick,
}) => {
  const safeAlt = (alt || 'User').trim();
  const initials = safeAlt
    ? safeAlt
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'U'
    : 'U';

  const elementId = `avatar-${safeAlt.replace(/\s+/g, '-').toLowerCase() || 'user'}`;
  const hasCustomRing = className.includes('ring-');

  return (
    <div
      id={elementId}
      onClick={onClick}
      className={`relative inline-block flex-shrink-0 ${sizeClasses[size]} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div
        className={`w-full h-full rounded-full overflow-hidden bg-surface-elevated flex items-center justify-center font-medium text-text-primary ${
          hasCustomRing ? '' : 'ring-1 ring-border'
        }`}
      >
        {src ? (
          <img src={src} alt={safeAlt} className="w-full h-full object-cover rounded-full" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    </div>
  );
};
