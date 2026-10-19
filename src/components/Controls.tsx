import type { ReactNode } from 'react';
import type { GenParams } from '../api';

export const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="bg-black/50 border border-emerald-500/30 p-3 space-y-3">
    <h3 className="font-oracle text-lg text-emerald-400 uppercase tracking-widest">{title}</h3>
    {children}
  </section>
);

export const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
    {label}
    <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="accent-emerald-500" />
  </label>
);

const NumberField = ({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) => (
  <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
    {label}
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
      className="w-24 bg-slate-900 border border-emerald-800 text-emerald-200 px-2 py-0.5 text-right"
    />
  </label>
);

export const ParamsEditor = ({ params, onChange }: { params: GenParams; onChange: (p: GenParams) => void }) => {
  const set = (k: keyof GenParams) => (v: number) => onChange({ ...params, [k]: v });
  return (
    <div className="space-y-1.5">
      <NumberField label="temperature" value={params.temperature} step={0.05} min={0} max={2} onChange={set('temperature')} />
      <NumberField label="top_p" value={params.top_p} step={0.05} min={0} max={1} onChange={set('top_p')} />
      <NumberField label="top_k" value={params.top_k} step={1} min={0} max={200} onChange={set('top_k')} />
      <NumberField label="min_p" value={params.min_p} step={0.01} min={0} max={1} onChange={set('min_p')} />
      <NumberField label="repeat penalty" value={params.repeat_penalty} step={0.05} min={1} max={2} onChange={set('repeat_penalty')} />
      <NumberField label="max tokens" value={params.max_tokens} step={32} min={16} max={4096} onChange={set('max_tokens')} />
      <NumberField label="context" value={params.n_ctx} step={512} min={512} max={32768} onChange={set('n_ctx')} />
      <NumberField label="seed" value={params.seed} step={1} min={0} max={2 ** 31} onChange={set('seed')} />
    </div>
  );
};

const CORRUPTION = [
  { max: 20, label: 'Nominal', color: 'text-emerald-500' },
  { max: 50, label: 'Anomalous', color: 'text-yellow-500' },
  { max: 80, label: 'Unstable', color: 'text-orange-500' },
  { max: 100, label: 'Singularity', color: 'text-red-500' },
];

export const CorruptionSlider = ({ level, onChange }: { level: number; onChange: (v: number) => void }) => {
  const tier = CORRUPTION.find(t => level <= t.max)!;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          Status: <span className={`${tier.color} font-bold`}>{tier.label}</span>
        </span>
        <span className="text-emerald-300">{level}%</span>
      </div>
      <input type="range" min={0} max={100} value={level} onChange={e => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
};

export const btn =
  'px-3 py-1.5 border font-mono text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-emerald-700 text-emerald-300 bg-slate-900/60 hover:bg-emerald-700/20 hover:border-emerald-500';

export const btnDanger =
  'px-3 py-1.5 border font-mono text-xs cursor-pointer border-red-700 text-red-300 bg-slate-900/60 hover:bg-red-700/20';
