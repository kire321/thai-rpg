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
export function normalizeLine(line: any): any;
export function getMostOverdueCardInfo(state: State): any;
export function getNextEpisodeInfo(state: State, env: Env): any;
export function formatDueDate(dueDate: number, isNew: boolean, isAgain: boolean, today?: number): string;
export function getCardDueDate(card: any, stats: any, againQueue: string[]): number;
export function getNextEpisode(state: State, env: Env): any;
export function getQuizCardForTag(state: State, env: Env): any;
export function countDueCardsInEpisode(episode: any, state: State, env: Env): number;
