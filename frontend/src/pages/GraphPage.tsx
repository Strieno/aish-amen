import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { Crosshair, Loader2, Search, X } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import type { GraphData, GraphNode } from '../lib/types';
import { PageHeader, Button, Card, EmptyState } from '../components/ui';

const TYPE_COLORS: Record<string, string> = {
  goal: '#2E7D32',
  task: '#C77E1F',
  course: '#1A5C8C',
  exam: '#B0493F',
  conversation: '#6D4C9D',
  memory: '#00796B',
  journal: '#5D6D7E',
  milestone: '#2E7D32',
  focus_session: '#00838F',
  work_note: '#5C6BC0',
  safe_living_plan: '#388E3C',
  checkin: '#C2185B',
};

const ALL_TYPES = ['goal', 'task', 'course', 'exam', 'conversation', 'memory', 'journal', 'milestone', 'focus_session', 'work_note', 'safe_living_plan'];

interface SimNode extends SimulationNodeDatum, GraphNode {}

export default function GraphPage() {
  const t = useT();
  const navigate = useNavigate();
  const [focus, setFocus] = useState<{ type: string; id: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState({ x: 0, y: 0, k: 1 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [simulating, setSimulating] = useState(false);

  const url = focus
    ? `/graph?entity_type=${encodeURIComponent(focus.type)}&entity_id=${encodeURIComponent(focus.id)}`
    : typeFilter.length
      ? `/graph?types=${typeFilter.join(',')}`
      : '/graph';
  const { data, loading } = useApi<GraphData>(url, [focus, typeFilter.join(',')]);

  const nodes: SimNode[] = useMemo(() => (data?.nodes || []).map((n) => ({ ...n })), [data]);
  const edges = useMemo(
    () =>
      (data?.edges || []).map((e) => ({
        id: e.id,
        source: e.source as unknown,
        target: e.target as unknown,
        relationship: e.relationship,
        confidence: e.confidence,
      })),
    [data],
  );

  useEffect(() => {
    if (!nodes.length || !svgRef.current) return;
    setSimulating(true);
    const linkDatum = edges as SimulationLinkDatum<SimNode>[];
    const sim: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(nodes)
      .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(linkDatum).id((d) => d.id).distance(110).strength(0.4))
      .force('charge', forceManyBody().strength(-320))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>().radius(46));
    sim.on('tick', () => {
      const pos: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) pos[n.id] = { x: n.x || 0, y: n.y || 0 };
      setPositions(pos);
    });
    sim.on('end', () => setSimulating(false));
    // Warm up + cool down quickly to keep the graph calm.
    sim.alpha(1).restart();
    const timer = window.setTimeout(() => sim.stop(), 4000);
    return () => {
      window.clearTimeout(timer);
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const svgSize = { w: 900, h: 620 };

  const visibleNodes = useMemo(() => {
    if (!search.trim()) return nodes;
    const q = search.trim().toLowerCase();
    return nodes.filter((n) => n.title.toLowerCase().includes(q));
  }, [nodes, search]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const k = Math.min(3, Math.max(0.3, z.k * (e.deltaY < 0 ? 1.12 : 0.9)));
      return { x: z.x, y: z.y, k };
    });
  }, []);

  // Drag: simple pointer-based panning of the whole graph.
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-node]')) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: zoom.x, oy: zoom.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setZoom((z) => ({ ...z, x: dragRef.current!.ox + (e.clientX - dragRef.current!.sx), y: dragRef.current!.oy + (e.clientY - dragRef.current!.sy) }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const openEntity = (n: GraphNode) => {
    navigate(entityRoute(n.type, n.entityId));
  };

  const toggleType = (type: string) => {
    setFocus(null);
    setTypeFilter((list) => (list.includes(type) ? list.filter((x) => x !== type) : [...list, type]));
  };

  return (
    <div className="space-y-3">
      <PageHeader title={t('graph.title')} subtitle={t('graph.hint')} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {focus ? (
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => { setFocus(null); setSelected(null); }}>
            <X className="h-3.5 w-3.5" /> {t('graph.clear')}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-1">
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`chip cursor-pointer ${typeFilter.includes(type) ? 'bg-brand text-white' : ''}`}
              >
                {t(type === 'goal' ? 'nav.goals' : type === 'task' ? 'nav.tasks' : type === 'course' || type === 'exam' ? 'nav.study' : type === 'conversation' ? 'nav.chat' : type === 'memory' ? 'nav.memory' : type === 'journal' ? 'nav.journal' : type === 'work_note' ? 'nav.work' : type === 'safe_living_plan' ? 'nav.safe' : type === 'focus_session' ? 'nav.focus' : type)}
              </button>
            ))}
          </div>
        )}
        <div className="relative ms-auto">
          <Search className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint rtl:right-2.5 ltr:left-2.5" />
          <input className="input !w-40 !py-1.5 ps-8 text-xs" placeholder={t('graph.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1 text-[10px] text-ink-faint">
            <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[type] }} />
            {t(type === 'goal' ? 'nav.goals' : type === 'task' ? 'nav.tasks' : type === 'course' || type === 'exam' ? 'nav.study' : type === 'conversation' ? 'nav.chat' : type === 'memory' ? 'nav.memory' : type === 'journal' ? 'nav.journal' : type === 'work_note' ? 'nav.work' : type === 'safe_living_plan' ? 'nav.safe' : type === 'focus_session' ? 'nav.focus' : type)}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand-dark" /></div>
      ) : nodes.length === 0 ? (
        <EmptyState text={t('graph.empty')} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
              className="h-[560px] w-full cursor-grab touch-none select-none bg-[radial-gradient(circle,rgb(var(--brand-soft))_0%,rgb(var(--card))_70%)] active:cursor-grabbing"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <g transform={`translate(${zoom.x},${zoom.y}) scale(${zoom.k})`}>
                {/* Edges */}
                {edges.map((e) => {
                  const sid = typeof e.source === 'string' ? e.source : (e.source as SimNode).id;
                  const tid = typeof e.target === 'string' ? e.target : (e.target as SimNode).id;
                  const s = positions[sid] || { x: 0, y: 0 };
                  const tt = positions[tid] || { x: 0, y: 0 };
                  const isRelated = selected && (sid === selected.id || tid === selected.id);
                  return (
                    <line
                      key={e.id}
                      x1={s.x}
                      y1={s.y}
                      x2={tt.x}
                      y2={tt.y}
                      stroke={isRelated ? 'rgb(var(--brand))' : 'rgb(var(--line))'}
                      strokeWidth={isRelated ? 2 : 1}
                      strokeOpacity={0.8}
                    />
                  );
                })}
                {/* Nodes */}
                {nodes.map((n) => {
                  const pos = positions[n.id] || { x: 0, y: 0 };
                  const dim = visibleNodes.includes(n) ? 1 : 0.15;
                  const isCenter = data?.center === n.id;
                  const isSel = selected?.id === n.id;
                  const color = TYPE_COLORS[n.type] || '#888';
                  return (
                    <g
                      key={n.id}
                      data-node
                      transform={`translate(${pos.x},${pos.y})`}
                      opacity={dim}
                      style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                      onClick={() => setSelected(n)}
                      onDoubleClick={() => openEntity(n)}
                    >
                      <circle r={isCenter ? 30 : 24} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={isSel ? 3 : isCenter ? 2 : 1} />
                      <circle r={isCenter ? 26 : 20} fill={color} fillOpacity={0.9} />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={13} fill="#fff" style={{ pointerEvents: 'none' }}>
                        {n.title.slice(0, 1)}
                      </text>
                      <title>{n.title}</title>
                      <text y={isCenter ? 46 : 40} textAnchor="middle" fontSize={11} fill="rgb(var(--ink-soft))" style={{ pointerEvents: 'none' }}>
                        {n.title.length > 18 ? n.title.slice(0, 17) + '…' : n.title}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
            {simulating && (
              <span className="absolute end-3 top-3 flex items-center gap-1.5 rounded-pill bg-card/90 px-3 py-1 text-xs text-ink-faint backdrop-blur">
                <Loader2 className="h-3 w-3 animate-spin" /> {t('common.loading')}
              </span>
            )}
            <p className="absolute bottom-3 start-3 text-[11px] text-ink-faint">{t('graph.clickHint')}</p>
          </div>
        </Card>
      )}

      {/* Selected node panel */}
      {selected && (
        <Card className="!p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: (TYPE_COLORS[selected.type] || '#888') + '22', color: TYPE_COLORS[selected.type] }}>
              {(() => { const I = entityIcon(selected.type); return <I className="h-5 w-5" />; })()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{selected.title}</p>
              {selected.sub && <p className="text-xs text-ink-faint">{selected.sub}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button className="!px-3 !py-1.5 text-xs" onClick={() => openEntity(selected)}>
                  {t('graph.open')}
                </Button>
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setFocus({ type: selected.type, id: selected.entityId })}>
                  <Crosshair className="h-3.5 w-3.5" /> {t('graph.focus')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
