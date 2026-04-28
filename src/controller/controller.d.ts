export interface State {
  [key: string]: any;
}

export interface Env {
  [key: string]: any;
}

export interface Props {
  [key: string]: any;
}

export function getProps(state: State, env: Env): Props;
export const Handlers: Record<string, (state: State, env: Env, ...args: any[]) => any>;
export function sm2Schedule(quality: number, repetitions: number, interval: number, ef: number): { interval: number; repetitions: number; ef: number };
