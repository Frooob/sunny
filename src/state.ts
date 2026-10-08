import { defaultConfig, type SunnyConfig } from "./config.ts";

export interface AppState {
  config: SunnyConfig;
  /** The date+time currently being visualized/inspected. */
  date: Date;
}

type Listener = (state: AppState) => void;

export class Store {
  private state: AppState;
  private listeners: Listener[] = [];

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  update(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.notify();
  }

  updateConfig(patch: Partial<SunnyConfig>) {
    this.state = { ...this.state, config: { ...this.state.config, ...patch } };
    this.notify();
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const l of this.listeners) l(this.state);
  }
}

export function createDefaultStore(): Store {
  const now = new Date();
  now.setHours(17, 0, 0, 0);
  return new Store({ config: { ...defaultConfig }, date: now });
}
