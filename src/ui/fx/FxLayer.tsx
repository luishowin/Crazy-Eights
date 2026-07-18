// Decorative overlay: animates positioned card clones and text pops on top of
// the real UI with the Web Animations API. Fire-and-forget — if a rect is
// missing or reduced-motion is on, effects silently no-op. Never blocks state.

import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../engine/cards';
import { CardFace, CardBack } from '../Card';
import { prefersReducedMotion } from './anchors';

export interface FlyJob {
  kind: 'fly';
  id: number;
  card?: Card; // undefined = card back
  from: DOMRect;
  to: DOMRect;
  durMs: number;
  delayMs: number;
  onDone?: () => void;
}
export interface PopJob {
  kind: 'pop';
  id: number;
  at: DOMRect;
  text: string;
  className?: string;
}
type Job = FlyJob | PopJob;

let seq = 0;
let listener: ((j: Job) => void) | null = null;

export const fx = {
  fly(opts: Omit<FlyJob, 'kind' | 'id' | 'durMs' | 'delayMs'> & { durMs?: number; delayMs?: number }): void {
    if (prefersReducedMotion() || !listener) {
      opts.onDone?.();
      return;
    }
    listener({ kind: 'fly', id: ++seq, durMs: 320, delayMs: 0, ...opts });
  },
  pop(opts: Omit<PopJob, 'kind' | 'id'>): void {
    if (prefersReducedMotion() || !listener) return;
    listener({ kind: 'pop', id: ++seq, ...opts });
  },
};

function FlyClone({ job, remove }: { job: FlyJob; remove: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx = job.to.left + job.to.width / 2 - (job.from.left + job.from.width / 2);
    const dy = job.to.top + job.to.height / 2 - (job.from.top + job.from.height / 2);
    const sx = job.to.width / job.from.width;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      job.onDone?.();
      remove(job.id);
    };
    const anim = el.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', offset: 0 },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${sx})`,
          offset: 1,
        },
      ],
      {
        duration: job.durMs,
        delay: job.delayMs,
        easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
        fill: 'forwards',
      },
    );
    anim.onfinish = finish;
    anim.oncancel = finish;
    // Safety valve in case WAAPI callbacks never fire.
    const t = setTimeout(finish, job.durMs + job.delayMs + 400);
    return () => {
      clearTimeout(t);
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="fx-card"
      style={{
        left: job.from.left,
        top: job.from.top,
        width: job.from.width,
        height: job.from.height,
      }}
    >
      <div style={{ transform: `scale(${job.from.width / cssCardWidth()})`, transformOrigin: 'top left' }}>
        {job.card ? <CardFace card={job.card} /> : <CardBack />}
      </div>
    </div>
  );
}

/** Current --card-w in px, so clones render at anchor size regardless of CSS. */
function cssCardWidth(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--card-w');
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 64;
}

function PopText({ job, remove }: { job: PopJob; remove: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const finish = () => remove(job.id);
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.15)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -140%) scale(1)', opacity: 0 },
      ],
      { duration: 750, easing: 'ease-out', fill: 'forwards' },
    );
    anim.onfinish = finish;
    anim.oncancel = finish;
    const t = setTimeout(finish, 1200);
    return () => {
      clearTimeout(t);
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className={`fx-pop ${job.className ?? ''}`}
      style={{ left: job.at.left + job.at.width / 2, top: job.at.top + job.at.height / 2 }}
    >
      {job.text}
    </div>
  );
}

export function FxLayer() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    listener = (j) => setJobs((prev) => [...prev.slice(-14), j]);
    return () => {
      listener = null;
    };
  }, []);
  const remove = (id: number) => setJobs((prev) => prev.filter((j) => j.id !== id));

  return (
    <div className="fx-layer" aria-hidden>
      {jobs.map((j) =>
        j.kind === 'fly' ? (
          <FlyClone key={j.id} job={j} remove={remove} />
        ) : (
          <PopText key={j.id} job={j} remove={remove} />
        ),
      )}
    </div>
  );
}
