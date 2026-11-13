import React, { useRef, useId } from 'react';
import { TacticalDiagram } from '../types/basketball';

interface BasketballCourtDiagramProps {
  diagram: TacticalDiagram;
  interactive?: boolean;
  onUpdateEntityPosition?: (id: string, x: number, y: number) => void;
  selectedEntityId?: string | null;
  onSelectEntity?: (id: string | null) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'responsive';
  className?: string;
}

export const BasketballCourtDiagram: React.FC<BasketballCourtDiagramProps> = ({
  diagram,
  interactive = false,
  onUpdateEntityPosition,
  selectedEntityId = null,
  onSelectEntity,
  size = 'responsive',
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const uid = useId().replace(/:/g, '');

  const viewBoxWidth = 100;
  const viewBoxHeight = 88;

  const handlePointerDown = (entityId: string, e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    draggingIdRef.current = entityId;
    onSelectEntity?.(entityId);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!interactive || !draggingIdRef.current || !onUpdateEntityPosition || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * viewBoxWidth;
    const rawY = ((e.clientY - rect.top) / rect.height) * viewBoxHeight;

    const clampedX = Math.max(4, Math.min(viewBoxWidth - 4, Math.round(rawX)));
    const clampedY = Math.max(4, Math.min(viewBoxHeight - 4, Math.round(rawY)));

    onUpdateEntityPosition(draggingIdRef.current, clampedX, clampedY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!interactive || !draggingIdRef.current) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    draggingIdRef.current = null;
  };

  const sizeClasses = {
    xs: 'w-28 aspect-[100/88]',
    sm: 'w-44 aspect-[100/88]',
    md: 'w-64 aspect-[100/88]',
    lg: 'w-full max-w-md aspect-[100/88]',
    responsive: 'w-full max-w-[300px] mx-auto aspect-[100/88]'
  }[size];

  const passId = `arrow-pass-${uid}`;
  const cutId = `arrow-cut-${uid}`;
  const dribbleId = `arrow-dribble-${uid}`;

  return (
    <div className={`relative select-none flex flex-col items-center ${className}`}>
      <div className={`relative overflow-hidden rounded-xl border border-neutral-200 bg-white ${sizeClasses}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={() => interactive && onSelectEntity?.(null)}
        >
          <defs>
            <marker id={passId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#0284c7" />
            </marker>
            <marker id={cutId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#ea580c" />
            </marker>
            <marker id={dribbleId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#171717" />
            </marker>
          </defs>

          {/* Clean Whiteboard Surface */}
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#FFFFFF" />

          {/* Court Lines */}
          <line x1="6" y1="8" x2="94" y2="8" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="6" y1="8" x2="6" y2="86" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="94" y1="8" x2="94" y2="86" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="6" y1="86" x2="94" y2="86" stroke="#CBD5E1" strokeWidth="1.2" />
          <path d="M 40 86 A 10 10 0 0 1 60 86" fill="none" stroke="#CBD5E1" strokeWidth="1.2" />

          {/* Key / Paint */}
          <rect x="36" y="8" width="28" height="34" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.2" />
          <path d="M 36 42 A 14 14 0 0 0 64 42" fill="none" stroke="#CBD5E1" strokeWidth="1.2" />
          <path d="M 36 42 A 14 14 0 0 1 64 42" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeDasharray="2 2" />

          {/* Backboard & Rim */}
          <line x1="43" y1="12" x2="57" y2="12" stroke="#64748B" strokeWidth="1.6" />
          <line x1="50" y1="12" x2="50" y2="14" stroke="#EA580C" strokeWidth="1.4" />
          <circle cx="50" cy="16.5" r="3" fill="none" stroke="#EA580C" strokeWidth="1.4" />
          <path d="M 43 16.5 A 7 7 0 0 0 57 16.5" fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="1.5 1.5" />

          {/* 3-Point Arc */}
          <path
            d="M 12 8 L 12 22 A 38.5 38.5 0 0 0 88 22 L 88 8"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1.2"
          />

          {/* Annotations */}
          {diagram.annotations?.map(ann => {
            if (ann.type === 'pass') {
              return (
                <line
                  key={ann.id}
                  x1={ann.fromX}
                  y1={ann.fromY}
                  x2={ann.toX}
                  y2={ann.toY}
                  stroke="#0284c7"
                  strokeWidth="1.6"
                  strokeDasharray="3 2"
                  markerEnd={`url(#${passId})`}
                />
              );
            }
            if (ann.type === 'cut') {
              return (
                <line
                  key={ann.id}
                  x1={ann.fromX}
                  y1={ann.fromY}
                  x2={ann.toX}
                  y2={ann.toY}
                  stroke="#ea580c"
                  strokeWidth="1.8"
                  markerEnd={`url(#${cutId})`}
                />
              );
            }
            if (ann.type === 'dribble') {
              const midX = (ann.fromX + ann.toX) / 2 + 3;
              const midY = (ann.fromY + ann.toY) / 2 - 2;
              return (
                <path
                  key={ann.id}
                  d={`M ${ann.fromX} ${ann.fromY} Q ${midX} ${midY} ${ann.toX} ${ann.toY}`}
                  fill="none"
                  stroke="#171717"
                  strokeWidth="1.6"
                  strokeDasharray="1.5 1.5"
                  markerEnd={`url(#${dribbleId})`}
                />
              );
            }
            if (ann.type === 'screen') {
              const dx = ann.toX - ann.fromX;
              const dy = ann.toY - ann.fromY;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const px = -uy * 3.5;
              const py = ux * 3.5;
              return (
                <g key={ann.id}>
                  <line x1={ann.fromX} y1={ann.fromY} x2={ann.toX} y2={ann.toY} stroke="#475569" strokeWidth="1.6" />
                  <line x1={ann.toX - px} y1={ann.toY - py} x2={ann.toX + px} y2={ann.toY + py} stroke="#171717" strokeWidth="2.8" strokeLinecap="round" />
                </g>
              );
            }
            return null;
          })}

          {/* Entities */}
          {diagram.entities.map(entity => {
            const isSelected = selectedEntityId === entity.id;
            const isBall = entity.isBall || entity.role === 'ball';
            const isOffense = entity.isOffense !== false && !isBall && !entity.role.startsWith('x');

            return (
              <g
                key={entity.id}
                transform={`translate(${entity.x}, ${entity.y})`}
                className={interactive ? 'cursor-grab active:cursor-grabbing' : ''}
                onPointerDown={(e) => handlePointerDown(entity.id, e)}
              >
                {isSelected && (
                  <circle
                    cx="0"
                    cy="0"
                    r="6.2"
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth="1.2"
                    strokeDasharray="2 1"
                  />
                )}

                {isBall ? (
                  <g>
                    <circle cx="0" cy="0" r="3" fill="#ea580c" stroke="#9a3412" strokeWidth="0.7" />
                    <line x1="-2.8" y1="0" x2="2.8" y2="0" stroke="#7c2d12" strokeWidth="0.5" />
                    <line x1="0" y1="-2.8" x2="0" y2="2.8" stroke="#7c2d12" strokeWidth="0.5" />
                  </g>
                ) : isOffense ? (
                  <g>
                    <circle cx="0" cy="0" r="4.2" fill="#171717" />
                    <text x="0" y="1.4" textAnchor="middle" fill="#FFFFFF" fontSize="4.2" fontWeight="700" fontFamily="system-ui, sans-serif">
                      {entity.label || entity.role}
                    </text>
                  </g>
                ) : (
                  <g>
                    <circle cx="0" cy="0" r="4.2" fill="#FFFFFF" stroke="#DC2626" strokeWidth="1.2" />
                    <text x="0" y="1.3" textAnchor="middle" fill="#DC2626" fontSize="3.8" fontWeight="700" fontFamily="system-ui, sans-serif">
                      {entity.label || entity.role}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {interactive && (
          <div className="absolute bottom-1.5 right-1.5 bg-white/90 text-[10px] text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200 pointer-events-none">
            Drag players
          </div>
        )}
      </div>
    </div>
  );
};
