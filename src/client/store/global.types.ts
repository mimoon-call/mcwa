export type GlobalState = {
  nextWarmAt: string | null;
  activeList: string[];
  readyCount: number;
  totalCount: number;
};

export type InstanceStateData = {
  activeList: string[];
  readyCount: number;
  totalCount: number;
};

export type GlobalStateKeys = keyof GlobalState;
