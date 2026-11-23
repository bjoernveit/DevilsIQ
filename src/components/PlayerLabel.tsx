import React from 'react';
import { Medal } from 'lucide-react';
import { PlayerMedals } from '../utils/quizEngine';

interface PlayerLabelProps {
  name: string;
  medals?: PlayerMedals;
  isOnline?: boolean;
  className?: string;
  medalClassName?: string;
}

export const PlayerLabel: React.FC<PlayerLabelProps> = ({
  name,
  medals,
  isOnline = false,
  className = '',
  medalClassName = 'w-3.5 h-3.5'
}) => {
  const gold = medals?.gold || 0;
  const silver = medals?.silver || 0;
  const bronze = medals?.bronze || 0;
  const hasMedals = gold > 0 || silver > 0 || bronze > 0;

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {isOnline && (
        <span
          className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.75)]"
          title="Online (Runde in der letzten Minute gestartet)"
          aria-label="Online"
        />
      )}
      <span className="truncate">{name}</span>
      {hasMedals && (
        <span className="inline-flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-bold">
          {gold > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-amber-400"
              title={`${gold}× Gold`}
            >
              <Medal className={`${medalClassName} text-amber-400 fill-amber-400/20 shrink-0`} />
              <span>{gold}</span>
            </span>
          )}
          {silver > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-zinc-200"
              title={`${silver}× Silber`}
            >
              <Medal className={`${medalClassName} text-zinc-300 fill-zinc-300/20 shrink-0`} />
              <span>{silver}</span>
            </span>
          )}
          {bronze > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-orange-400"
              title={`${bronze}× Bronze`}
            >
              <Medal className={`${medalClassName} text-orange-400 fill-orange-400/20 shrink-0`} />
              <span>{bronze}</span>
            </span>
          )}
        </span>
      )}
    </span>
  );
};
