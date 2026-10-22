import { Html } from "@react-three/drei";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import { FARM_GRID_SIZE } from "@my-farm/game-model/selectors";
import { useFarmSettings } from "../../farmSettings";
import { ResourceIcon } from "../ResourceIcon";
import { admitFeedbackCues, detectFeedbackCues, type ActiveFeedback, type FeedbackKitName } from "./harvestFeedback";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type SpriteFrame = {
  timeMs: number;
  durationMs: number;
  empty: boolean;
  rect: { x: number; y: number; width: number; height: number };
  trimOffset: { x: number; y: number };
  sourceSize: { width: number; height: number };
};

type FeedbackSequence = {
  kit: FeedbackKitName;
  concurrency: { maxActive: number; overflow: "drop-new" };
  endMs: number;
  audio: { file: string; onsetMs: number };
  visual: { file: string; reducedMotionFile: string; onsetMs: number; width: number; height: number; frames: SpriteFrame[] };
};

type SoundOutcome = "played" | "muted" | "locked" | "blocked";

const KITS: FeedbackKitName[] = ["farm.harvest-pop", "ui.reward-pulse"];
const INTENSITY = "subtle";
const BOARD_ORIGIN = -(FARM_GRID_SIZE - 1) / 2;
const SPRITE_SCALE = 1.5;
const UNRENDERED_GRACE_MS = 5_000;
const farmArt = (file: string) => `${import.meta.env.BASE_URL}farm-art/${file}`;

let sequencesPromise: Promise<Partial<Record<FeedbackKitName, FeedbackSequence>>> | null = null;
function loadSequences() {
  sequencesPromise ??= Promise.all(
    KITS.map(async (kit) => {
      try {
        const response = await fetch(farmArt(`${kit}.${INTENSITY}.json`));
        return response.ok ? ([kit, (await response.json()) as FeedbackSequence] as const) : null;
      } catch {
        return null;
      }
    }),
  ).then((entries) => Object.fromEntries(entries.filter((entry) => entry !== null)));
  return sequencesPromise;
}

// Sound starts only after the player's first tap or click in the Farm.
let audioUnlocked = false;
function useAudioUnlock() {
  useEffect(() => {
    if (audioUnlocked) return;
    const unlock = () => {
      audioUnlocked = true;
      window.removeEventListener("pointerdown", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    return () => window.removeEventListener("pointerdown", unlock, true);
  }, []);
}

function playCue(sequence: FeedbackSequence, soundEnabled: boolean, report: (outcome: SoundOutcome) => void) {
  if (!soundEnabled) return report("muted");
  if (!audioUnlocked) return report("locked");
  window.setTimeout(() => {
    try {
      const audio = new Audio(farmArt(sequence.audio.file));
      audio.play().then(
        () => report("played"),
        () => report("blocked"),
      );
    } catch {
      report("blocked");
    }
  }, sequence.audio.onsetMs);
}

export function HarvestFeedbackLayer({ catalog, view }: { catalog: CatalogDocument; view: FarmView }) {
  const settings = useFarmSettings();
  const systemReducedMotion = usePrefersReducedMotion();
  const stillFrame = systemReducedMotion || settings.reducedMotion;
  const [sequences, setSequences] = useState<Partial<Record<FeedbackKitName, FeedbackSequence>>>({});
  const [active, setActive] = useState<ActiveFeedback[]>([]);
  const [sounds, setSounds] = useState<Record<string, SoundOutcome>>({});
  const previous = useRef<FarmView | null>(null);
  const activeRef = useRef<ActiveFeedback[]>([]);
  const timers = useRef(new Set<number>());
  const soundRef = useRef(settings.sound);
  soundRef.current = settings.sound;
  useAudioUnlock();

  useEffect(() => {
    let live = true;
    void loadSequences().then((loaded) => live && setSequences(loaded));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const cues = detectFeedbackCues(catalog, previous.current, view);
    previous.current = view;
    if (cues.length === 0) return;
    for (const kit of KITS) {
      const sequence = sequences[kit];
      if (!sequence) continue;
      const before = activeRef.current;
      const admitted = admitFeedbackCues(before, cues.filter((cue) => cue.kit === kit), performance.now(), sequence.concurrency.maxActive);
      activeRef.current = admitted;
      for (const entry of admitted.slice(before.length)) {
        playCue(sequence, soundRef.current, (outcome) => setSounds((all) => ({ ...all, [entry.key]: outcome })));
        // Normally the rendered effect finishes itself; this only frees a slot that never rendered.
        timers.current.add(window.setTimeout(() => finish(entry.key), sequence.endMs + UNRENDERED_GRACE_MS));
      }
    }
    setActive(activeRef.current);
  }, [catalog, sequences, view]);

  const finish = (key: string) => {
    if (!activeRef.current.some((item) => item.key === key)) return;
    activeRef.current = activeRef.current.filter((item) => item.key !== key);
    setActive(activeRef.current);
    setSounds((all) => {
      const { [key]: _removed, ...rest } = all;
      return rest;
    });
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <>
      {active.map((entry) => {
        const sequence = sequences[entry.kit];
        if (!sequence) return null;
        return (
          <Html
            key={entry.key}
            position={[entry.anchor.x + BOARD_ORIGIN, entry.target === "field_plot" ? 0.4 : 1.4, entry.anchor.y + BOARD_ORIGIN]}
            center
            zIndexRange={[90, 0]}
            wrapperClass="farm-feedback-wrapper"
          >
            <div
              className={`farm-feedback farm-feedback--${entry.target}${stillFrame ? " farm-feedback--still" : ""}`}
              data-testid="farm-feedback"
              data-feedback-key={entry.key}
              data-kit={entry.kit}
              data-target={entry.target}
              data-item={entry.itemId ?? ""}
              data-motion={stillFrame ? "still" : "animated"}
              data-sound={sounds[entry.key] ?? "pending"}
              aria-hidden="true"
            >
              <KitSprite sequence={sequence} still={stillFrame} onDone={() => finish(entry.key)} />
              {entry.kit === "ui.reward-pulse" && entry.itemId ? (
                <span className="farm-feedback__icon">
                  <ResourceIcon type="item" itemId={entry.itemId} />
                </span>
              ) : null}
            </div>
          </Html>
        );
      })}
    </>
  );
}

function KitSprite({ sequence, still, onDone }: { sequence: FeedbackSequence; still: boolean; onDone: () => void }) {
  const frames = sequence.visual.frames;
  const [index, setIndex] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  // The kit timeline starts when the effect is actually on screen.
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), sequence.endMs);
    return () => window.clearTimeout(timer);
  }, [sequence.endMs]);

  useEffect(() => {
    if (still) return;
    const timers = frames.map((frame, frameIndex) =>
      window.setTimeout(() => setIndex(frameIndex), sequence.visual.onsetMs + frame.timeMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [frames, sequence.visual.onsetMs, still]);

  const size = frames[0]?.sourceSize ?? { width: 64, height: 64 };
  const box: CSSProperties = { width: size.width * SPRITE_SCALE, height: size.height * SPRITE_SCALE };
  if (still) {
    return <img className="farm-feedback__sprite" style={box} src={farmArt(sequence.visual.reducedMotionFile)} alt="" />;
  }
  const frame = frames[index];
  return (
    <span className="farm-feedback__sprite" style={box} data-frame={index}>
      {frame && !frame.empty ? (
        <span
          style={{
            position: "absolute",
            left: frame.trimOffset.x * SPRITE_SCALE,
            top: frame.trimOffset.y * SPRITE_SCALE,
            width: frame.rect.width * SPRITE_SCALE,
            height: frame.rect.height * SPRITE_SCALE,
            backgroundImage: `url(${farmArt(sequence.visual.file)})`,
            backgroundSize: `${sequence.visual.width * SPRITE_SCALE}px ${sequence.visual.height * SPRITE_SCALE}px`,
            backgroundPosition: `${-frame.rect.x * SPRITE_SCALE}px ${-frame.rect.y * SPRITE_SCALE}px`,
            imageRendering: "pixelated",
          }}
        />
      ) : null}
    </span>
  );
}
